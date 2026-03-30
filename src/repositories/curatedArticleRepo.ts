import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { CuratedArticle } from '../types';

interface CuratedArticleRow {
  id: string;
  raw_article_id: string;
  title: string;
  url: string;
  published_at: string;
  summary: string;
  why_it_matters: string;
  use_cases: string;
  category: string;
  relevance_score: number;
  dedupe_group_id: string;
  digest_id: string | null;
  created_at: string;
}

function rowToArticle(row: CuratedArticleRow): CuratedArticle {
  return {
    id: row.id,
    rawArticleId: row.raw_article_id,
    title: row.title,
    url: row.url,
    publishedAt: new Date(row.published_at),
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    useCases: JSON.parse(row.use_cases),
    category: row.category,
    relevanceScore: row.relevance_score,
    dedupeGroupId: row.dedupe_group_id,
  };
}

export class CuratedArticleRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getByDigestId: Database.Statement;
    getByCategory: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
    assignToDigest: Database.Statement;
    getSentArticleUrls: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO curated_articles (id, raw_article_id, title, url, published_at, summary, why_it_matters, use_cases, category, relevance_score, dedupe_group_id, digest_id, created_at)
        VALUES (@id, @raw_article_id, @title, @url, @published_at, @summary, @why_it_matters, @use_cases, @category, @relevance_score, @dedupe_group_id, @digest_id, @created_at)
      `),
      getById: db.prepare('SELECT * FROM curated_articles WHERE id = ?'),
      getByDigestId: db.prepare('SELECT * FROM curated_articles WHERE digest_id = ? ORDER BY category, relevance_score DESC'),
      getByCategory: db.prepare('SELECT * FROM curated_articles WHERE category = ? ORDER BY relevance_score DESC'),
      update: db.prepare(`
        UPDATE curated_articles SET title = @title, url = @url, summary = @summary,
        why_it_matters = @why_it_matters, use_cases = @use_cases, category = @category,
        relevance_score = @relevance_score, dedupe_group_id = @dedupe_group_id WHERE id = @id
      `),
      deleteById: db.prepare('DELETE FROM curated_articles WHERE id = ?'),
      assignToDigest: db.prepare('UPDATE curated_articles SET digest_id = @digest_id WHERE id = @id'),
      getSentArticleUrls: db.prepare('SELECT DISTINCT url FROM curated_articles WHERE digest_id IS NOT NULL'),
    };
  }

  create(article: Omit<CuratedArticle, 'id'> & { id?: string }, digestId?: string): CuratedArticle {
    const id = article.id ?? uuidv4();
    const now = new Date().toISOString();
    this.stmts.insert.run({
      id,
      raw_article_id: article.rawArticleId,
      title: article.title,
      url: article.url,
      published_at: article.publishedAt.toISOString(),
      summary: article.summary,
      why_it_matters: article.whyItMatters,
      use_cases: JSON.stringify(article.useCases),
      category: article.category,
      relevance_score: article.relevanceScore,
      dedupe_group_id: article.dedupeGroupId,
      digest_id: digestId ?? null,
      created_at: now,
    });
    return { ...article, id };
  }

  getById(id: string): CuratedArticle | undefined {
    const row = this.stmts.getById.get(id) as CuratedArticleRow | undefined;
    return row ? rowToArticle(row) : undefined;
  }

  getByDigestId(digestId: string): CuratedArticle[] {
    return (this.stmts.getByDigestId.all(digestId) as CuratedArticleRow[]).map(rowToArticle);
  }

  getByCategory(category: string): CuratedArticle[] {
    return (this.stmts.getByCategory.all(category) as CuratedArticleRow[]).map(rowToArticle);
  }

  update(article: CuratedArticle): void {
    this.stmts.update.run({
      id: article.id,
      title: article.title,
      url: article.url,
      summary: article.summary,
      why_it_matters: article.whyItMatters,
      use_cases: JSON.stringify(article.useCases),
      category: article.category,
      relevance_score: article.relevanceScore,
      dedupe_group_id: article.dedupeGroupId,
    });
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }

  assignToDigest(id: string, digestId: string): void {
    this.stmts.assignToDigest.run({ id, digest_id: digestId });
  }

  getSentArticleUrls(): Set<string> {
    const rows = this.stmts.getSentArticleUrls.all() as { url: string }[];
    return new Set(rows.map((r) => r.url));
  }
}
