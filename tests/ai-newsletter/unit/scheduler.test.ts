import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NewsletterScheduler,
  isPublishDay,
  buildCronExpression,
} from '../../../src/scheduler/index';
import type { ScheduleConfig } from '../../../src/types';

describe('isPublishDay', () => {
  it('should return true for Monday when monday is configured', () => {
    const monday = new Date(Date.UTC(2024, 0, 8));
    expect(isPublishDay(monday, ['monday', 'friday'])).toBe(true);
  });

  it('should return true for Friday when friday is configured', () => {
    const friday = new Date(Date.UTC(2024, 0, 12));
    expect(isPublishDay(friday, ['monday', 'friday'])).toBe(true);
  });

  it('should return false for non-configured days', () => {
    const tuesday = new Date(Date.UTC(2024, 0, 9));
    expect(isPublishDay(tuesday, ['monday', 'friday'])).toBe(false);
  });

  it('should be case-insensitive for day names', () => {
    const monday = new Date(Date.UTC(2024, 0, 8));
    expect(isPublishDay(monday, ['Monday', 'Friday'])).toBe(true);
  });

  it('should return false for empty days array', () => {
    const monday = new Date(Date.UTC(2024, 0, 8));
    expect(isPublishDay(monday, [])).toBe(false);
  });
});

describe('buildCronExpression', () => {
  it('should build correct cron for default schedule (Mon+Fri 06:00 CST)', () => {
    const config: ScheduleConfig = { days: ['monday', 'friday'], time: '06:00', timezone: 'America/Chicago' };
    expect(buildCronExpression(config)).toBe('0 6 * * 1,5');
  });

  it('should handle single day', () => {
    const config: ScheduleConfig = { days: ['monday'], time: '09:30', timezone: 'America/Chicago' };
    expect(buildCronExpression(config)).toBe('30 9 * * 1');
  });

  it('should handle midnight', () => {
    const config: ScheduleConfig = { days: ['friday'], time: '00:00', timezone: 'America/New_York' };
    expect(buildCronExpression(config)).toBe('0 0 * * 5');
  });

  it('should handle minutes correctly', () => {
    const config: ScheduleConfig = { days: ['monday', 'friday'], time: '14:45', timezone: 'America/Chicago' };
    expect(buildCronExpression(config)).toBe('45 14 * * 1,5');
  });
});

describe('NewsletterScheduler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start and stop without errors', () => {
    const config: ScheduleConfig = { days: ['monday', 'friday'], time: '06:00', timezone: 'America/Chicago' };
    const pipeline = vi.fn().mockResolvedValue(undefined);
    const scheduler = new NewsletterScheduler(config, pipeline);

    scheduler.start();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Scheduler] Starting cron schedule')
    );

    scheduler.stop();
    expect(consoleSpy).toHaveBeenCalledWith('[Scheduler] Cron schedule stopped');
  });

  it('should stop previous task when start is called again', () => {
    const config: ScheduleConfig = { days: ['monday'], time: '06:00', timezone: 'America/Chicago' };
    const pipeline = vi.fn().mockResolvedValue(undefined);
    const scheduler = new NewsletterScheduler(config, pipeline);

    scheduler.start();
    scheduler.start();
    expect(consoleSpy).toHaveBeenCalledWith('[Scheduler] Cron schedule stopped');

    scheduler.stop();
  });

  it('should not throw when stop is called without start', () => {
    const config: ScheduleConfig = { days: ['monday'], time: '06:00', timezone: 'America/Chicago' };
    const pipeline = vi.fn().mockResolvedValue(undefined);
    const scheduler = new NewsletterScheduler(config, pipeline);

    expect(() => scheduler.stop()).not.toThrow();
  });
});
