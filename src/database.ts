import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Initializes the SQLite database with all required tables and indexes.
 * Creates the data directory if it doesn't exist.
 *
 * @param dbPath - Path to the SQLite database file (default: ./data/newsletter.db)
 * @returns The initialized better-sqlite3 Database instance
 */
export function initDatabase(dbPath: string = './data/newsletter.db'): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);
  createIndexes(db);

  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('rss', 'atom', 'scrape', 'tool-radar')),
      categories TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_articles (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at TEXT NOT NULL,
      raw_content TEXT NOT NULL,
      is_tool_radar_candidate INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(url)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS digests (
      id TEXT PRIMARY KEY,
      published_at TEXT NOT NULL,
      editorial_intro TEXT NOT NULL,
      total_article_count INTEGER NOT NULL,
      category_count INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      html_content TEXT NOT NULL,
      plain_text_content TEXT NOT NULL,
      archive_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS curated_articles (
      id TEXT PRIMARY KEY,
      raw_article_id TEXT NOT NULL REFERENCES raw_articles(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      use_cases TEXT NOT NULL,
      category TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      dedupe_group_id TEXT NOT NULL,
      digest_id TEXT REFERENCES digests(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_radar_entries (
      id TEXT PRIMARY KEY,
      raw_article_id TEXT NOT NULL REFERENCES raw_articles(id),
      name TEXT NOT NULL,
      one_liner TEXT NOT NULL,
      description TEXT NOT NULL,
      best_for TEXT NOT NULL,
      url TEXT NOT NULL,
      digest_id TEXT REFERENCES digests(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'pending')) DEFAULT 'pending',
      subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
      unsubscribed_at TEXT,
      consecutive_bounces INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_log (
      id TEXT PRIMARY KEY,
      digest_id TEXT NOT NULL REFERENCES digests(id),
      subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'bounced')),
      error TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function createIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_raw_articles_published ON raw_articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_raw_articles_source ON raw_articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_raw_articles_tool_radar ON raw_articles(is_tool_radar_candidate);
    CREATE INDEX IF NOT EXISTS idx_curated_articles_digest ON curated_articles(digest_id);
    CREATE INDEX IF NOT EXISTS idx_curated_articles_category ON curated_articles(category);
    CREATE INDEX IF NOT EXISTS idx_tool_radar_digest ON tool_radar_entries(digest_id);
    CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
    CREATE INDEX IF NOT EXISTS idx_delivery_log_digest ON delivery_log(digest_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_log_subscriber ON delivery_log(subscriber_id);
  `);
}
