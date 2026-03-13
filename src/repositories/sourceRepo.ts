import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Source } from '../types';

interface SourceRow {
  id: string;
  name: string;
  url: string;
  type: string;
  categories: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToSource(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type as Source['type'],
    categories: JSON.parse(row.categories),
    enabled: row.enabled === 1,
  };
}

export class SourceRepo {
  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getAll: Database.Statement;
    getEnabled: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
    getByUrl: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO sources (id, name, url, type, categories, enabled, created_at, updated_at)
        VALUES (@id, @name, @url, @type, @categories, @enabled, @created_at, @updated_at)
      `),
      getById: db.prepare('SELECT * FROM sources WHERE id = ?'),
      getAll: db.prepare('SELECT * FROM sources ORDER BY name'),
      getEnabled: db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY name'),
      update: db.prepare(`
        UPDATE sources SET name = @name, url = @url, type = @type, categories = @categories,
        enabled = @enabled, updated_at = @updated_at WHERE id = @id
      `),
      deleteById: db.prepare('DELETE FROM sources WHERE id = ?'),
      getByUrl: db.prepare('SELECT * FROM sources WHERE url = ?'),
    };
  }

  create(source: Omit<Source, 'id'> & { id?: string }): Source {
    const now = new Date().toISOString();
    const id = source.id ?? uuidv4();
    this.stmts.insert.run({
      id,
      name: source.name,
      url: source.url,
      type: source.type,
      categories: JSON.stringify(source.categories),
      enabled: source.enabled ? 1 : 0,
      created_at: now,
      updated_at: now,
    });
    return { ...source, id };
  }

  getById(id: string): Source | undefined {
    const row = this.stmts.getById.get(id) as SourceRow | undefined;
    return row ? rowToSource(row) : undefined;
  }

  getAll(): Source[] {
    return (this.stmts.getAll.all() as SourceRow[]).map(rowToSource);
  }

  getEnabled(): Source[] {
    return (this.stmts.getEnabled.all() as SourceRow[]).map(rowToSource);
  }

  update(source: Source): void {
    this.stmts.update.run({
      id: source.id,
      name: source.name,
      url: source.url,
      type: source.type,
      categories: JSON.stringify(source.categories),
      enabled: source.enabled ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
  }

  delete(id: string): void {
    this.stmts.deleteById.run(id);
  }

  getByUrl(url: string): Source | undefined {
    const row = this.stmts.getByUrl.get(url) as SourceRow | undefined;
    return row ? rowToSource(row) : undefined;
  }
}
