import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ToolRadarEntry } from '../types';

interface ToolRadarRow {
  id: string;
  raw_article_id: string;
  name: string;
  one_liner: string;
  description: string;
  best_for: string;
  url: string;
  digest_id: string | null;
  created_at: string;
}

function rowToEntry(row: ToolRadarRow): ToolRadarEntry {
  return {
    id: row.id,
    rawArticleId: row.raw_article_id,
    name: row.name,
    oneLiner: row.one_liner,
    description: row.description,
    bestFor: row.best_for,
    url: row.url,
  };
}

export class ToolRadarRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getByDigestId: Database.Statement;
    deleteById: Database.Statement;
    assignToDigest: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO tool_radar_entries (id, raw_article_id, name, one_liner, description, best_for, url, digest_id, created_at)
        VALUES (@id, @raw_article_id, @name, @one_liner, @description, @best_for, @url, @digest_id, @created_at)
      `),
      getById: db.prepare('SELECT * FROM tool_radar_entries WHERE id = ?'),
      getByDigestId: db.prepare('SELECT * FROM tool_radar_entries WHERE digest_id = ? ORDER BY name'),
      deleteById: db.prepare('DELETE FROM tool_radar_entries WHERE id = ?'),
      assignToDigest: db.prepare('UPDATE tool_radar_entries SET digest_id = @digest_id WHERE id = @id'),
    };
  }

  create(entry: Omit<ToolRadarEntry, 'id'> & { id?: string }, digestId?: string): ToolRadarEntry {
    const id = entry.id ?? uuidv4();
    const now = new Date().toISOString();
    this.stmts.insert.run({
      id,
      raw_article_id: entry.rawArticleId,
      name: entry.name,
      one_liner: entry.oneLiner,
      description: entry.description,
      best_for: entry.bestFor,
      url: entry.url,
      digest_id: digestId ?? null,
      created_at: now,
    });
    return { ...entry, id };
  }

  getById(id: string): ToolRadarEntry | undefined {
    const row = this.stmts.getById.get(id) as ToolRadarRow | undefined;
    return row ? rowToEntry(row) : undefined;
  }

  getByDigestId(digestId: string): ToolRadarEntry[] {
    return (this.stmts.getByDigestId.all(digestId) as ToolRadarRow[]).map(rowToEntry);
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }

  assignToDigest(id: string, digestId: string): void {
    this.stmts.assignToDigest.run({ id, digest_id: digestId });
  }
}
