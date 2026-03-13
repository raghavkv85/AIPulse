import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToSubscribers, ResendEmailSender } from '../../../src/delivery/emailSender';
import { Subscriber, EmailConfig } from '../../../src/types';

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 'sub-1',
    email: 'test@example.com',
    status: 'active',
    subscribedAt: new Date(),
    consecutiveBounces: 0,
    ...overrides,
  };
}

function makeMockResend(sendFn: ReturnType<typeof vi.fn>): ResendEmailSender {
  return { emails: { send: sendFn } };
}

function makeDeliveryLogRepo() {
  return {
    create: vi.fn().mockImplementation((record) => ({ ...record, id: 'log-1' })),
    getById: vi.fn(),
    getByDigestId: vi.fn().mockReturnValue([]),
    getBySubscriberId: vi.fn().mockReturnValue([]),
    delete: vi.fn(),
  };
}

const emailConfig: EmailConfig = {
  provider: 'resend',
  apiKey: 'test-api-key',
  from: 'newsletter@example.com',
  replyTo: 'reply@example.com',
};

const baseParams = {
  html: '<p>Hello</p>',
  plainText: 'Hello',
  subject: 'AI Pulse',
  emailConfig,
  digestId: 'digest-1',
  unsubscribeBaseUrl: 'https://example.com/unsubscribe',
};

describe('sendToSubscribers', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let resendClient: ResendEmailSender;
  let deliveryLogRepo: ReturnType<typeof makeDeliveryLogRepo>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSend = vi.fn();
    resendClient = makeMockResend(mockSend);
    deliveryLogRepo = makeDeliveryLogRepo();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should send email successfully and record sent status', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const subscriber = makeSubscriber();
    const result = await sendToSubscribers({
      ...baseParams,
      subscribers: [subscriber],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(0);

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBe('newsletter@example.com');
    expect(call.to).toBe('test@example.com');
    expect(call.subject).toBe('AI Pulse');
    expect(call.html).toBe('<p>Hello</p>');
    expect(call.text).toBe('Hello');
    expect(call.replyTo).toBe('reply@example.com');
    expect(call.headers['List-Unsubscribe']).toContain('sub-1');

    expect(deliveryLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        digestId: 'digest-1',
        subscriberId: 'sub-1',
        status: 'sent',
        error: null,
      }),
    );
  });

  it('should handle multiple subscribers', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const subscribers = [
      makeSubscriber({ id: 'sub-1', email: 'a@example.com' }),
      makeSubscriber({ id: 'sub-2', email: 'b@example.com' }),
      makeSubscriber({ id: 'sub-3', email: 'c@example.com' }),
    ];

    const result = await sendToSubscribers({
      ...baseParams,
      subscribers,
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    expect(result.sent).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(deliveryLogRepo.create).toHaveBeenCalledTimes(3);
  });

  it('should record failure for 4xx errors without retrying', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: '422 Unprocessable Entity', name: 'validation_error' },
    });

    const result = await sendToSubscribers({
      ...baseParams,
      subscribers: [makeSubscriber()],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('422');
    // No retry — only 1 call
    expect(mockSend).toHaveBeenCalledOnce();

    expect(deliveryLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('422') }),
    );
  });

  it('should retry transient 5xx errors with exponential backoff', async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: '500 Internal Server Error', name: 'internal_server_error' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: '503 Service Unavailable', name: 'internal_server_error' },
      })
      .mockResolvedValueOnce({ data: { id: 'email-1' }, error: null });

    const promise = sendToSubscribers({
      ...baseParams,
      subscribers: [makeSubscriber()],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    // Advance through backoff delays
    await vi.advanceTimersByTimeAsync(1000); // 1st retry backoff
    await vi.advanceTimersByTimeAsync(2000); // 2nd retry backoff

    const result = await promise;

    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('should fail after max retries for persistent transient errors', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: '500 Internal Server Error', name: 'internal_server_error' },
    });

    const promise = sendToSubscribers({
      ...baseParams,
      subscribers: [makeSubscriber()],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    // Advance through all backoff delays: 1s + 2s + 4s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;

    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(1);
    // Initial + 3 retries = 4 calls
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should handle thrown exceptions as transient errors', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ data: { id: 'email-1' }, error: null });

    const promise = sendToSubscribers({
      ...baseParams,
      subscribers: [makeSubscriber()],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should include personalized unsubscribe link in headers', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await sendToSubscribers({
      ...baseParams,
      subscribers: [makeSubscriber({ id: 'my-unique-id' })],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.headers['List-Unsubscribe']).toBe(
      '<https://example.com/unsubscribe?subscriberId=my-unique-id>',
    );
    expect(call.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('should handle empty subscriber list', async () => {
    const result = await sendToSubscribers({
      ...baseParams,
      subscribers: [],
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should continue sending to remaining subscribers after one fails', async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: '400 Bad Request', name: 'validation_error' },
      })
      .mockResolvedValueOnce({ data: { id: 'email-2' }, error: null });

    const subscribers = [
      makeSubscriber({ id: 'sub-1', email: 'bad@example.com' }),
      makeSubscriber({ id: 'sub-2', email: 'good@example.com' }),
    ];

    const result = await sendToSubscribers({
      ...baseParams,
      subscribers,
      deliveryLogRepo: deliveryLogRepo as any,
      resendClient,
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].subscriberId).toBe('sub-1');
    expect(deliveryLogRepo.create).toHaveBeenCalledTimes(2);
  });
});
