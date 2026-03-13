import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../../src/database';
import { SubscriberRepo } from '../../../src/repositories/subscriberRepo';
import { SubscriberManagerImpl, ResendClient } from '../../../src/subscriber/index';
import { EmailConfig } from '../../../src/types';

let db: Database.Database;
let dbPath: string;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-mgr-test-'));
  dbPath = path.join(dir, 'test.db');
  db = initDatabase(dbPath);
}

function teardown() {
  db.close();
  const dir = path.dirname(dbPath);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

const emailConfig: EmailConfig = {
  provider: 'resend',
  apiKey: 'test-key',
  from: 'news@example.com',
};

const unsubscribeBaseUrl = 'https://example.com/unsubscribe';

function makeMockResend(sendFn: ReturnType<typeof vi.fn>): ResendClient {
  return { emails: { send: sendFn } };
}

describe('SubscriberManagerImpl', () => {
  let repo: SubscriberRepo;
  let mockSend: ReturnType<typeof vi.fn>;
  let manager: SubscriberManagerImpl;

  beforeEach(() => {
    setup();
    repo = new SubscriberRepo(db);
    mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
    manager = new SubscriberManagerImpl(repo, emailConfig, unsubscribeBaseUrl, makeMockResend(mockSend));
  });

  afterEach(teardown);

  describe('subscribe', () => {
    it('should create a subscriber with pending status for valid email', async () => {
      const sub = await manager.subscribe('user@example.com');
      expect(sub.email).toBe('user@example.com');
      expect(sub.status).toBe('pending');
      expect(sub.consecutiveBounces).toBe(0);
    });

    it('should send a confirmation email on subscribe', async () => {
      await manager.subscribe('user@example.com');
      expect(mockSend).toHaveBeenCalledOnce();
      expect(mockSend.mock.calls[0][0].to).toBe('user@example.com');
    });

    it('should reject invalid email format', async () => {
      await expect(manager.subscribe('not-an-email')).rejects.toThrow('Invalid email format');
      await expect(manager.subscribe('')).rejects.toThrow('Invalid email format');
      await expect(manager.subscribe('missing@')).rejects.toThrow('Invalid email format');
    });

    it('should return existing subscriber for duplicate email', async () => {
      const first = await manager.subscribe('dup@example.com');
      const second = await manager.subscribe('dup@example.com');
      expect(second.id).toBe(first.id);
      // Confirmation email only sent once (for the first subscribe)
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('should leave subscriber in pending if confirmation email fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Resend API down'));
      const sub = await manager.subscribe('fail@example.com');
      expect(sub.status).toBe('pending');
    });
  });

  describe('unsubscribe', () => {
    it('should set subscriber status to inactive with timestamp', async () => {
      const sub = await manager.subscribe('user@example.com');
      await manager.confirmSubscription(sub.id);
      await manager.unsubscribe(sub.id);

      const updated = repo.getById(sub.id);
      expect(updated?.status).toBe('inactive');
      expect(updated?.unsubscribedAt).toBeDefined();
    });
  });

  describe('confirmSubscription', () => {
    it('should set status from pending to active', async () => {
      const sub = await manager.subscribe('user@example.com');
      expect(sub.status).toBe('pending');

      await manager.confirmSubscription(sub.id);
      const updated = repo.getById(sub.id);
      expect(updated?.status).toBe('active');
    });

    it('should not change status if not pending', async () => {
      const sub = await manager.subscribe('user@example.com');
      await manager.confirmSubscription(sub.id);
      await manager.unsubscribe(sub.id);

      // Try to confirm an inactive subscriber — should remain inactive
      await manager.confirmSubscription(sub.id);
      const updated = repo.getById(sub.id);
      expect(updated?.status).toBe('inactive');
    });
  });

  describe('recordBounce', () => {
    it('should increment consecutive bounces', async () => {
      const sub = await manager.subscribe('user@example.com');
      await manager.confirmSubscription(sub.id);

      await manager.recordBounce(sub.id);
      const after1 = repo.getById(sub.id);
      expect(after1?.consecutiveBounces).toBe(1);
      expect(after1?.status).toBe('active');
    });

    it('should deactivate subscriber at 2 consecutive bounces', async () => {
      const sub = await manager.subscribe('user@example.com');
      await manager.confirmSubscription(sub.id);

      await manager.recordBounce(sub.id);
      await manager.recordBounce(sub.id);

      const updated = repo.getById(sub.id);
      expect(updated?.consecutiveBounces).toBe(2);
      expect(updated?.status).toBe('inactive');
    });
  });

  describe('getActiveSubscribers', () => {
    it('should return only active subscribers', async () => {
      const s1 = await manager.subscribe('a@example.com');
      const s2 = await manager.subscribe('b@example.com');
      await manager.subscribe('c@example.com');

      await manager.confirmSubscription(s1.id);
      await manager.confirmSubscription(s2.id);
      // s3 stays pending

      const active = await manager.getActiveSubscribers();
      expect(active).toHaveLength(2);
      expect(active.map(s => s.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    });
  });

  describe('generateUnsubscribeLink', () => {
    it('should generate a URL with the subscriber ID', () => {
      const link = manager.generateUnsubscribeLink('sub-123');
      expect(link).toBe('https://example.com/unsubscribe?subscriberId=sub-123');
    });
  });

  describe('resetBounces', () => {
    it('should reset consecutive bounces to 0', async () => {
      const sub = await manager.subscribe('user@example.com');
      await manager.confirmSubscription(sub.id);
      await manager.recordBounce(sub.id);

      expect(repo.getById(sub.id)?.consecutiveBounces).toBe(1);

      manager.resetBounces(sub.id);
      expect(repo.getById(sub.id)?.consecutiveBounces).toBe(0);
    });
  });
});
