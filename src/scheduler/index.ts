import cron from 'node-cron';
import type { ScheduleConfig } from '../types';

/**
 * Maps day names to cron day-of-week numbers (0 = Sunday, 1 = Monday, ..., 5 = Friday).
 */
const DAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Checks whether a given date falls on one of the configured publish days.
 */
export function isPublishDay(date: Date, days: string[]): boolean {
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayName = dayNames[date.getUTCDay()];
  return days.map((d) => d.toLowerCase()).includes(dayName);
}

/**
 * Converts a ScheduleConfig into a cron expression string.
 *
 * Format: "minute hour * * dayOfWeek"
 * Example: days=['monday','friday'], timeUtc='08:00' → "0 8 * * 1,5"
 */
export function buildCronExpression(config: ScheduleConfig): string {
  const [hourStr, minuteStr] = config.time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  const cronDays = config.days
    .map((d) => DAY_TO_CRON[d.toLowerCase()])
    .filter((n) => n !== undefined)
    .join(',');

  return `${minute} ${hour} * * ${cronDays}`;
}

/**
 * Scheduler that runs the newsletter pipeline on a cron schedule.
 *
 * The actual pipeline wiring (aggregate → curate → deliver) is injected
 * via the `runPipeline` callback so this class stays decoupled from
 * the concrete component implementations.
 */
export class NewsletterScheduler {
  private task: cron.ScheduledTask | null = null;
  private readonly config: ScheduleConfig;
  private readonly runPipeline: () => Promise<void>;

  constructor(config: ScheduleConfig, runPipeline: () => Promise<void>) {
    this.config = config;
    this.runPipeline = runPipeline;
  }

  /**
   * Start the cron job. If already running, stops the previous one first.
   */
  start(): void {
    if (this.task) {
      this.stop();
    }

    const expression = buildCronExpression(this.config);
    const tz = this.config.timezone || 'America/Chicago';
    console.log(
      `[Scheduler] Starting cron schedule: "${expression}" (days: ${this.config.days.join(', ')}, time: ${this.config.time} ${tz})`
    );

    this.task = cron.schedule(
      expression,
      async () => {
        const startTime = new Date();
        console.log(`[Scheduler] Pipeline run started at ${startTime.toISOString()}`);

        try {
          await this.runPipeline();
        } catch (error) {
          console.error(
            `[Scheduler] Pipeline run failed:`,
            error instanceof Error ? error.message : error
          );
        }

        const endTime = new Date();
        console.log(`[Scheduler] Pipeline run ended at ${endTime.toISOString()}`);
      },
      { timezone: tz }
    );
  }

  /**
   * Stop the cron job.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[Scheduler] Cron schedule stopped');
    }
  }
}
