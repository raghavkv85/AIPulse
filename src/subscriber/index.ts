import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';
import { Subscriber, SubscriberManager, EmailConfig } from '../types';
import { SubscriberRepo } from '../repositories/subscriberRepo';

/**
 * Minimal interface for the Resend email sending capability.
 * Allows injecting a mock for testing.
 */
export interface ResendClient {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }): Promise<{ data: { id: string } | null; error: { message: string; name: string } | null }>;
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SubscriberManagerImpl implements SubscriberManager {
  private resendClient: ResendClient;

  constructor(
    private subscriberRepo: SubscriberRepo,
    private emailConfig: EmailConfig,
    private unsubscribeBaseUrl: string,
    resendClient?: ResendClient,
  ) {
    this.resendClient = resendClient ?? new Resend(emailConfig.apiKey);
  }

  async subscribe(email: string): Promise<Subscriber> {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    const existing = this.subscriberRepo.getByEmail(email);
    if (existing) {
      return existing;
    }

    const subscriber = this.subscriberRepo.create({
      email,
      status: 'pending',
      subscribedAt: new Date(),
      consecutiveBounces: 0,
    });

    // Send confirmation email — failure leaves subscriber in 'pending'
    try {
      await this.resendClient.emails.send({
        from: this.emailConfig.from,
        to: email,
        subject: 'Confirm your AI Newsletter subscription',
        html: `<p>Welcome! Please <a href="${this.unsubscribeBaseUrl.replace('/unsubscribe', '/confirm')}?subscriberId=${encodeURIComponent(subscriber.id)}">confirm your subscription</a>.</p>`,
      });
    } catch {
      // Log but don't throw — subscriber stays 'pending'
    }

    return subscriber;
  }

  async unsubscribe(subscriberId: string): Promise<void> {
    this.subscriberRepo.updateStatus(subscriberId, 'inactive', new Date());
  }

  async confirmSubscription(subscriberId: string): Promise<void> {
    const subscriber = this.subscriberRepo.getById(subscriberId);
    if (subscriber && subscriber.status === 'pending') {
      this.subscriberRepo.updateStatus(subscriberId, 'active');
    }
  }

  async recordBounce(subscriberId: string): Promise<void> {
    this.subscriberRepo.incrementBounces(subscriberId);
  }

  async getActiveSubscribers(): Promise<Subscriber[]> {
    return this.subscriberRepo.getActive();
  }

  generateUnsubscribeLink(subscriberId: string): string {
    return `${this.unsubscribeBaseUrl}?subscriberId=${encodeURIComponent(subscriberId)}`;
  }

  /**
   * Reset consecutive bounces to 0 on successful delivery.
   */
  resetBounces(subscriberId: string): void {
    this.subscriberRepo.resetBounces(subscriberId);
  }
}
