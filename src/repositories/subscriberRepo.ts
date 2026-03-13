import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Subscriber } from '../types';

interface SubscriberRow {
  id: string;
  email: string;
  status: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
  consecutive_bounces: number;
  updated_at: string;
}

function rowToSubscriber(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    email: row.email,
    status: row.status as Subscriber['status'],
    subscribedAt: new Date(row.subscribed_at),
    unsubscribedAt: row.unsubscribed_at ? new Date(row.unsubscribed_at) : undefined,
    consecutiveBounces: row.consecutive_bounces,
  };
}

export class SubscriberRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getByEmail: Database.Statement;
    getActive: Database.Statement;
    getAll: Database.Statement;
    updateStatus: Database.Statement;
    updateBounces: Database.Statement;
    resetBounces: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO subscribers (id, email, status, subscribed_at, unsubscribed_at, consecutive_bounces, updated_at)
        VALUES (@id, @email, @status, @subscribed_at, @unsubscribed_at, @consecutive_bounces, @updated_at)
      `),
      getById: db.prepare('SELECT * FROM subscribers WHERE id = ?'),
      getByEmail: db.prepare('SELECT * FROM subscribers WHERE email = ?'),
      getActive: db.prepare("SELECT * FROM subscribers WHERE status = 'active' ORDER BY email"),
      getAll: db.prepare('SELECT * FROM subscribers ORDER BY email'),
      updateStatus: db.prepare(`
        UPDATE subscribers SET status = @status, unsubscribed_at = @unsubscribed_at, updated_at = @updated_at WHERE id = @id
      `),
      updateBounces: db.prepare(`
        UPDATE subscribers SET consecutive_bounces = @consecutive_bounces, status = @status, updated_at = @updated_at WHERE id = @id
      `),
      resetBounces: db.prepare(`
        UPDATE subscribers SET consecutive_bounces = 0, updated_at = @updated_at WHERE id = @id
      `),
      deleteById: db.prepare('DELETE FROM subscribers WHERE id = ?'),
    };
  }

  create(subscriber: Omit<Subscriber, 'id'> & { id?: string }): Subscriber {
    const id = subscriber.id ?? uuidv4();
    const now = new Date().toISOString();
    this.stmts.insert.run({
      id,
      email: subscriber.email,
      status: subscriber.status,
      subscribed_at: subscriber.subscribedAt.toISOString(),
      unsubscribed_at: subscriber.unsubscribedAt?.toISOString() ?? null,
      consecutive_bounces: subscriber.consecutiveBounces,
      updated_at: now,
    });
    return { ...subscriber, id };
  }

  getById(id: string): Subscriber | undefined {
    const row = this.stmts.getById.get(id) as SubscriberRow | undefined;
    return row ? rowToSubscriber(row) : undefined;
  }

  getByEmail(email: string): Subscriber | undefined {
    const row = this.stmts.getByEmail.get(email) as SubscriberRow | undefined;
    return row ? rowToSubscriber(row) : undefined;
  }

  getActive(): Subscriber[] {
    return (this.stmts.getActive.all() as SubscriberRow[]).map(rowToSubscriber);
  }

  getAll(): Subscriber[] {
    return (this.stmts.getAll.all() as SubscriberRow[]).map(rowToSubscriber);
  }

  updateStatus(id: string, status: Subscriber['status'], unsubscribedAt?: Date): void {
    this.stmts.updateStatus.run({
      id,
      status,
      unsubscribed_at: unsubscribedAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  incrementBounces(id: string): Subscriber | undefined {
    const subscriber = this.getById(id);
    if (!subscriber) return undefined;
    const newCount = subscriber.consecutiveBounces + 1;
    const newStatus = newCount >= 2 ? 'inactive' : subscriber.status;
    this.stmts.updateBounces.run({
      id,
      consecutive_bounces: newCount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    });
    return { ...subscriber, consecutiveBounces: newCount, status: newStatus as Subscriber['status'] };
  }

  resetBounces(id: string): void {
    this.stmts.resetBounces.run({ updated_at: new Date().toISOString(), id });
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }
}
