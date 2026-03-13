import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { RawArticle } from '../types';

interface ArticleRow {
  id: string;
  source_id: string;
  title: string;
  url: string;
  published_at: string;
  raw_content: string;
  is_tool_radar_candidate: number;
  fetched_at: string;
}

function rowToArticle(row: ArticleRow): RawArticle {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    publishedAt: new Date(row.published_at),
    rawContent: row.raw_content,
    fetchedAt: new Date(row.fetched_at),
    isToolRadarCandidate: row.is_tool_radar_candidate === 1,
  };
}

export class ArticleRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getAll: Database.Statement;
    getByDateRange: Database.Statement;
    getToolRadarCandidates: Database.Statement;
    getBySourceId: Database.Statement;
    getByUrl: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO raw_articles (id, source_id, title, url, published_at, raw_content, is_tool_radar_candidate, fetched_at)
        VALUES (@id, @source_id, @title, @url, @published_at, @raw_content, @is_tool_radar_candidate, @fetched_at)
      `),
      getById: db.prepare('SELECT * FROM raw_articles WHERE id = ?'),
      getAll: db.prepare('SELECT * FROM raw_articles ORDER BY published_at DESC'),
      getByDateRange: db.prepare(
        'SELECT * FROM raw_articles WHERE published_at > @start AND published_at <= @end ORDER BY published_at DESC'
      ),
      getToolRadarCandidates: db.prepare(
        'SELECT * FROM raw_articles WHERE is_tool_radar_candidate = 1 ORDER BY published_at DESC'
      ),
      getBySourceId: db.prepare('SELECT * FROM raw_articles WHERE source_id = ? ORDER BY published_at DESC'),
      getByUrl: db.prepare('SELECT * FROM raw_articles WHERE url = ?'),
      deleteById: db.prepare('DELETE FROM raw_articles WHERE id = ?'),
    };
  }

  create(article: Omit<RawArticle, 'id'> & { id?: string }): RawArticle {
    const id = article.id ?? uuidv4();
    this.stmts.insert.run({
      id,
      source_id: article.sourceId,
      title: article.title,
      url: article.url,
      published_at: article.publishedAt.toISOString(),
      raw_content: article.rawContent,
      is_tool_radar_candidate: article.isToolRadarCandidate ? 1 : 0,
      fetched_at: article.fetchedAt.toISOString(),
    });
    return { ...article, id };
  }

  getById(id: string): RawArticle | undefined {
    const row = this.stmts.getById.get(id) as ArticleRow | undefined;
    return row ? rowToArticle(row) : undefined;
  }

  getAll(): RawArticle[] {
    return (this.stmts.getAll.all() as ArticleRow[]).map(rowToArticle);
  }

  getByDateRange(start: Date, end: Date): RawArticle[] {
    return (this.stmts.getByDateRange.all({
      start: start.toISOString(),
      end: end.toISOString(),
    }) as ArticleRow[]).map(rowToArticle);
  }

  getToolRadarCandidates(): RawArticle[] {
    return (this.stmts.getToolRadarCandidates.all() as ArticleRow[]).map(rowToArticle);
  }

  getBySourceId(sourceId: string): RawArticle[] {
    return (this.stmts.getBySourceId.all(sourceId) as ArticleRow[]).map(rowToArticle);
  }

  getByUrl(url: string): RawArticle | undefined {
    const row = this.stmts.getByUrl.get(url) as ArticleRow | undefined;
    return row ? rowToArticle(row) : undefined;
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }
}
