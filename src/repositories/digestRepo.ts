import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Digest } from '../types';

interface DigestRow {
  id: string;
  published_at: string;
  editorial_intro: string;
  total_article_count: number;
  category_count: number;
  period_start: string;
  period_end: string;
  html_content: string;
  plain_text_content: string;
  archive_url: string | null;
  created_at: string;
}

/** DB-level digest (without nested sections/toolRadar which live in separate tables) */
export interface DigestRecord {
  id: string;
  publishedAt: Date;
  editorialIntro: string;
  totalArticleCount: number;
  categoryCount: number;
  periodStart: Date;
  periodEnd: Date;
  htmlContent: string;
  plainTextContent: string;
  archiveUrl: string | null;
}

function rowToRecord(row: DigestRow): DigestRecord {
  return {
    id: row.id,
    publishedAt: new Date(row.published_at),
    editorialIntro: row.editorial_intro,
    totalArticleCount: row.total_article_count,
    categoryCount: row.category_count,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    htmlContent: row.html_content,
    plainTextContent: row.plain_text_content,
    archiveUrl: row.archive_url,
  };
}

export class DigestRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getAll: Database.Statement;
    getLatest: Database.Statement;
    updateArchiveUrl: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO digests (id, published_at, editorial_intro, total_article_count, category_count, period_start, period_end, html_content, plain_text_content, archive_url, created_at)
        VALUES (@id, @published_at, @editorial_intro, @total_article_count, @category_count, @period_start, @period_end, @html_content, @plain_text_content, @archive_url, @created_at)
      `),
      getById: db.prepare('SELECT * FROM digests WHERE id = ?'),
      getAll: db.prepare('SELECT * FROM digests ORDER BY published_at DESC'),
      getLatest: db.prepare('SELECT * FROM digests ORDER BY published_at DESC LIMIT 1'),
      updateArchiveUrl: db.prepare('UPDATE digests SET archive_url = @archive_url WHERE id = @id'),
      deleteById: db.prepare('DELETE FROM digests WHERE id = ?'),
    };
  }

  create(record: Omit<DigestRecord, 'id'> & { id?: string }): DigestRecord {
    const id = record.id ?? uuidv4();
    const now = new Date().toISOString();
    this.stmts.insert.run({
      id,
      published_at: record.publishedAt.toISOString(),
      editorial_intro: record.editorialIntro,
      total_article_count: record.totalArticleCount,
      category_count: record.categoryCount,
      period_start: record.periodStart.toISOString(),
      period_end: record.periodEnd.toISOString(),
      html_content: record.htmlContent,
      plain_text_content: record.plainTextContent,
      archive_url: record.archiveUrl ?? null,
      created_at: now,
    });
    return { ...record, id };
  }

  getById(id: string): DigestRecord | undefined {
    const row = this.stmts.getById.get(id) as DigestRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  /** Returns all digests ordered by publication date descending (most recent first). */
  getAll(): DigestRecord[] {
    return (this.stmts.getAll.all() as DigestRow[]).map(rowToRecord);
  }

  getLatest(): DigestRecord | undefined {
    const row = this.stmts.getLatest.get() as DigestRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  updateArchiveUrl(id: string, archiveUrl: string): void {
    this.stmts.updateArchiveUrl.run({ id, archive_url: archiveUrl });
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }
}
