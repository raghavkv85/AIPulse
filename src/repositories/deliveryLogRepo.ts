import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface DeliveryLogRecord {
  id: string;
  digestId: string;
  subscriberId: string;
  status: 'sent' | 'failed' | 'bounced';
  error: string | null;
  sentAt: Date;
}

interface DeliveryLogRow {
  id: string;
  digest_id: string;
  subscriber_id: string;
  status: string;
  error: string | null;
  sent_at: string;
}

function rowToRecord(row: DeliveryLogRow): DeliveryLogRecord {
  return {
    id: row.id,
    digestId: row.digest_id,
    subscriberId: row.subscriber_id,
    status: row.status as DeliveryLogRecord['status'],
    error: row.error,
    sentAt: new Date(row.sent_at),
  };
}

export class DeliveryLogRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getByDigestId: Database.Statement;
    getBySubscriberId: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO delivery_log (id, digest_id, subscriber_id, status, error, sent_at)
        VALUES (@id, @digest_id, @subscriber_id, @status, @error, @sent_at)
      `),
      getById: db.prepare('SELECT * FROM delivery_log WHERE id = ?'),
      getByDigestId: db.prepare('SELECT * FROM delivery_log WHERE digest_id = ? ORDER BY sent_at DESC'),
      getBySubscriberId: db.prepare('SELECT * FROM delivery_log WHERE subscriber_id = ? ORDER BY sent_at DESC'),
      deleteById: db.prepare('DELETE FROM delivery_log WHERE id = ?'),
    };
  }

  create(record: Omit<DeliveryLogRecord, 'id'> & { id?: string }): DeliveryLogRecord {
    const id = record.id ?? uuidv4();
    this.stmts.insert.run({
      id,
      digest_id: record.digestId,
      subscriber_id: record.subscriberId,
      status: record.status,
      error: record.error ?? null,
      sent_at: record.sentAt.toISOString(),
    });
    return { ...record, id };
  }

  getById(id: string): DeliveryLogRecord | undefined {
    const row = this.stmts.getById.get(id) as DeliveryLogRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  getByDigestId(digestId: string): DeliveryLogRecord[] {
    return (this.stmts.getByDigestId.all(digestId) as DeliveryLogRow[]).map(rowToRecord);
  }

  getBySubscriberId(subscriberId: string): DeliveryLogRecord[] {
    return (this.stmts.getBySubscriberId.all(subscriberId) as DeliveryLogRow[]).map(rowToRecord);
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }
}
