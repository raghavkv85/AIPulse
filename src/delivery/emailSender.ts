import { Resend } from 'resend';
import { Subscriber, SubscriberFailure, EmailConfig } from '../types';
import { DeliveryLogRepo } from '../repositories/deliveryLogRepo';

/**
 * Delay helper for exponential backoff.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines if an error is transient (5xx / network) and worth retrying.
 */
function isTransientError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    /\b5\d{2}\b/.test(errorMessage) ||
    msg.includes('internal server error') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    msg.includes('bad gateway') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up')
  );
}

/**
 * Minimal interface for the Resend email sending capability.
 * Allows injecting a mock for testing.
 */
export interface ResendEmailSender {
  emails: {
    send(payload: {
      from: string;
      replyTo?: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      headers?: Record<string, string>;
    }): Promise<{ data: { id: string } | null; error: { message: string; name: string } | null }>;
  };
}

/**
 * Sends a single email via Resend with retry logic for transient errors.
 * Returns null on success, or an error string on permanent failure.
 */
async function sendWithRetry(
  client: ResendEmailSender,
  params: {
    from: string;
    replyTo?: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
  },
  maxRetries: number = 3,
): Promise<string | null> {
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await client.emails.send({
        from: params.from,
        replyTo: params.replyTo,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        headers: params.headers,
      });

      if (error) {
        lastError = error.message || 'Unknown Resend error';

        // Don't retry 4xx errors
        if (!isTransientError(lastError)) {
          return lastError;
        }

        // Retry transient errors with exponential backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await delay(backoffMs);
          continue;
        }

        return lastError;
      }

      // Success
      return null;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);

      if (!isTransientError(lastError)) {
        return lastError;
      }

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await delay(backoffMs);
        continue;
      }

      return lastError;
    }
  }

  return lastError;
}

/**
 * Sends an HTML email (with plain text fallback) to a list of subscribers via Resend.
 * Records delivery status in the delivery_log table.
 * Retries transient (5xx) errors with exponential backoff (max 3 retries).
 * Does not retry 4xx errors.
 */
export async function sendToSubscribers(params: {
  html: string;
  plainText: string;
  subject: string;
  subscribers: Subscriber[];
  emailConfig: EmailConfig;
  digestId: string;
  deliveryLogRepo: DeliveryLogRepo;
  unsubscribeBaseUrl: string;
  /** Optional: inject a Resend client (for testing). Defaults to creating one from emailConfig.apiKey. */
  resendClient?: ResendEmailSender;
}): Promise<{ sent: number; failed: SubscriberFailure[] }> {
  const {
    html,
    plainText,
    subject,
    subscribers,
    emailConfig,
    digestId,
    deliveryLogRepo,
    unsubscribeBaseUrl,
  } = params;

  const client: ResendEmailSender = params.resendClient ?? new Resend(emailConfig.apiKey);
  let sent = 0;
  const failed: SubscriberFailure[] = [];

  for (const subscriber of subscribers) {
    const unsubscribeLink = `${unsubscribeBaseUrl}?subscriberId=${encodeURIComponent(subscriber.id)}`;

    const error = await sendWithRetry(client, {
      from: emailConfig.from,
      replyTo: emailConfig.replyTo,
      to: subscriber.email,
      subject,
      html,
      text: plainText,
      headers: {
        'List-Unsubscribe': `<${unsubscribeLink}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      failed.push({
        subscriberId: subscriber.id,
        email: subscriber.email,
        error,
      });

      deliveryLogRepo.create({
        digestId,
        subscriberId: subscriber.id,
        status: 'failed',
        error,
        sentAt: new Date(),
      });
    } else {
      sent++;

      deliveryLogRepo.create({
        digestId,
        subscriberId: subscriber.id,
        status: 'sent',
        error: null,
        sentAt: new Date(),
      });
    }
  }

  return { sent, failed };
}
