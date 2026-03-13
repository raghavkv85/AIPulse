import { describe, it, expect, afterEach } from 'vitest';
import { initDatabase } from '../../../src/database';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function createTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsletter-test-'));
  return path.join(dir, 'test.db');
}

function cleanup(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('initDatabase', () => {
  let dbPath: string;

  afterEach(() => {
    if (dbPath) cleanup(dbPath);
  });

  it('should create the database file and return a database instance', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('should create all 7 required tables', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      'curated_articles',
      'delivery_log',
      'digests',
      'raw_articles',
      'sources',
      'subscribers',
      'tool_radar_entries',
    ]);
    db.close();
  });

  it('should create all 9 required indexes', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];

    const indexNames = indexes.map((i) => i.name).sort();
    expect(indexNames).toEqual([
      'idx_curated_articles_category',
      'idx_curated_articles_digest',
      'idx_delivery_log_digest',
      'idx_delivery_log_subscriber',
      'idx_raw_articles_published',
      'idx_raw_articles_source',
      'idx_raw_articles_tool_radar',
      'idx_subscribers_status',
      'idx_tool_radar_digest',
    ]);
    db.close();
  });

  it('should enable foreign keys', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
    db.close();
  });

  it('should be idempotent (safe to call multiple times)', () => {
    dbPath = createTempDbPath();
    const db1 = initDatabase(dbPath);
    db1.close();

    const db2 = initDatabase(dbPath);
    const tables = db2
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    expect(tables.length).toBe(7);
    db2.close();
  });

  it('should enforce source type check constraint', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);

    expect(() => {
      db.prepare(
        "INSERT INTO sources (id, name, url, type, categories) VALUES ('s1', 'Test', 'https://test.com', 'invalid', '[]')"
      ).run();
    }).toThrow();

    // Valid types should work
    db.prepare(
      "INSERT INTO sources (id, name, url, type, categories) VALUES ('s1', 'Test', 'https://test.com', 'rss', '[]')"
    ).run();
    db.close();
  });

  it('should enforce subscriber status check constraint', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);

    expect(() => {
      db.prepare(
        "INSERT INTO subscribers (id, email, status) VALUES ('sub1', 'test@example.com', 'invalid')"
      ).run();
    }).toThrow();

    db.prepare(
      "INSERT INTO subscribers (id, email, status) VALUES ('sub1', 'test@example.com', 'active')"
    ).run();
    db.close();
  });

  it('should enforce delivery_log status check constraint', () => {
    dbPath = createTempDbPath();
    const db = initDatabase(dbPath);

    // Insert prerequisite data
    db.prepare(
      "INSERT INTO sources (id, name, url, type, categories) VALUES ('s1', 'Src', 'https://src.com', 'rss', '[]')"
    ).run();
    db.prepare(
      "INSERT INTO digests (id, published_at, editorial_intro, total_article_count, category_count, period_start, period_end, html_content, plain_text_content) VALUES ('d1', '2024-01-01', 'intro', 5, 3, '2024-01-01', '2024-01-03', '<html></html>', 'text')"
    ).run();
    db.prepare(
      "INSERT INTO subscribers (id, email, status) VALUES ('sub1', 'test@example.com', 'active')"
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO delivery_log (id, digest_id, subscriber_id, status) VALUES ('dl1', 'd1', 'sub1', 'invalid')"
      ).run();
    }).toThrow();

    db.prepare(
      "INSERT INTO delivery_log (id, digest_id, subscriber_id, status) VALUES ('dl1', 'd1', 'sub1', 'sent')"
    ).run();
    db.close();
  });

  it('should create data directory if it does not exist', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsletter-test-'));
    dbPath = path.join(tempDir, 'nested', 'deep', 'test.db');
    const db = initDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
    // cleanup the whole temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
    dbPath = ''; // prevent double cleanup
  });
});
