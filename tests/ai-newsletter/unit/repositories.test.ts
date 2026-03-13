import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase } from '../../../src/database';
import {
  SourceRepo,
  ArticleRepo,
  CuratedArticleRepo,
  ToolRadarRepo,
  DigestRepo,
  SubscriberRepo,
  DeliveryLogRepo,
} from '../../../src/repositories';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let db: Database.Database;
let dbPath: string;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
  dbPath = path.join(dir, 'test.db');
  db = initDatabase(dbPath);
}

function teardown() {
  db.close();
  const dir = path.dirname(dbPath);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ── SourceRepo ──────────────────────────────────────────────────────────────

describe('SourceRepo', () => {
  let repo: SourceRepo;
  beforeEach(() => { setup(); repo = new SourceRepo(db); });
  afterEach(teardown);

  it('should create and retrieve a source', () => {
    const src = repo.create({ name: 'Test', url: 'https://test.com/feed', type: 'rss', categories: ['ai'], enabled: true });
    expect(src.id).toBeDefined();
    const found = repo.getById(src.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test');
    expect(found!.categories).toEqual(['ai']);
    expect(found!.enabled).toBe(true);
  });

  it('should list all and enabled sources', () => {
    repo.create({ name: 'A', url: 'https://a.com', type: 'rss', categories: [], enabled: true });
    repo.create({ name: 'B', url: 'https://b.com', type: 'atom', categories: [], enabled: false });
    expect(repo.getAll()).toHaveLength(2);
    expect(repo.getEnabled()).toHaveLength(1);
  });

  it('should update a source', () => {
    const src = repo.create({ name: 'Old', url: 'https://old.com', type: 'rss', categories: [], enabled: true });
    repo.update({ ...src, name: 'New', enabled: false });
    const updated = repo.getById(src.id)!;
    expect(updated.name).toBe('New');
    expect(updated.enabled).toBe(false);
  });

  it('should delete a source', () => {
    const src = repo.create({ name: 'Del', url: 'https://del.com', type: 'scrape', categories: [], enabled: true });
    repo.delete(src.id);
    expect(repo.getById(src.id)).toBeUndefined();
  });

  it('should find source by URL', () => {
    repo.create({ name: 'X', url: 'https://x.com', type: 'tool-radar', categories: ['tools'], enabled: true });
    expect(repo.getByUrl('https://x.com')).toBeDefined();
    expect(repo.getByUrl('https://nope.com')).toBeUndefined();
  });
});

// ── ArticleRepo ─────────────────────────────────────────────────────────────

describe('ArticleRepo', () => {
  let sourceRepo: SourceRepo;
  let repo: ArticleRepo;
  let sourceId: string;

  beforeEach(() => {
    setup();
    sourceRepo = new SourceRepo(db);
    repo = new ArticleRepo(db);
    sourceId = sourceRepo.create({ name: 'S', url: 'https://s.com', type: 'rss', categories: [], enabled: true }).id;
  });
  afterEach(teardown);

  it('should create and retrieve an article', () => {
    const art = repo.create({
      sourceId, title: 'Title', url: 'https://art.com/1',
      publishedAt: new Date('2024-06-01'), rawContent: 'content',
      fetchedAt: new Date('2024-06-01'), isToolRadarCandidate: false,
    });
    const found = repo.getById(art.id)!;
    expect(found.title).toBe('Title');
    expect(found.publishedAt).toEqual(new Date('2024-06-01'));
    expect(found.isToolRadarCandidate).toBe(false);
  });

  it('should query articles by date range', () => {
    repo.create({ sourceId, title: 'Old', url: 'https://a.com/old', publishedAt: new Date('2024-01-01'), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false });
    repo.create({ sourceId, title: 'Mid', url: 'https://a.com/mid', publishedAt: new Date('2024-06-15'), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false });
    repo.create({ sourceId, title: 'New', url: 'https://a.com/new', publishedAt: new Date('2024-12-01'), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false });

    const results = repo.getByDateRange(new Date('2024-06-01'), new Date('2024-12-31'));
    expect(results).toHaveLength(2);
    expect(results.map(r => r.title)).toContain('Mid');
    expect(results.map(r => r.title)).toContain('New');
  });

  it('should query tool radar candidates', () => {
    repo.create({ sourceId, title: 'Normal', url: 'https://a.com/n', publishedAt: new Date(), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false });
    repo.create({ sourceId, title: 'Tool', url: 'https://a.com/t', publishedAt: new Date(), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: true });
    const candidates = repo.getToolRadarCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Tool');
  });

  it('should delete an article', () => {
    const art = repo.create({ sourceId, title: 'D', url: 'https://a.com/d', publishedAt: new Date(), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false });
    repo.delete(art.id);
    expect(repo.getById(art.id)).toBeUndefined();
  });
});

// ── CuratedArticleRepo ──────────────────────────────────────────────────────

describe('CuratedArticleRepo', () => {
  let repo: CuratedArticleRepo;
  let rawArticleId: string;

  beforeEach(() => {
    setup();
    const srcRepo = new SourceRepo(db);
    const artRepo = new ArticleRepo(db);
    const sid = srcRepo.create({ name: 'S', url: 'https://s.com', type: 'rss', categories: [], enabled: true }).id;
    rawArticleId = artRepo.create({ sourceId: sid, title: 'Raw', url: 'https://raw.com', publishedAt: new Date(), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: false }).id;
    repo = new CuratedArticleRepo(db);
  });
  afterEach(teardown);

  it('should create and retrieve a curated article', () => {
    const ca = repo.create({
      rawArticleId, title: 'Curated', url: 'https://raw.com',
      publishedAt: new Date('2024-06-01'), summary: 'Sum', whyItMatters: 'Why',
      useCases: ['a', 'b'], category: 'openai', relevanceScore: 0.9, dedupeGroupId: 'g1',
    });
    const found = repo.getById(ca.id)!;
    expect(found.summary).toBe('Sum');
    expect(found.useCases).toEqual(['a', 'b']);
    expect(found.relevanceScore).toBe(0.9);
  });

  it('should query by category', () => {
    repo.create({ rawArticleId, title: 'A', url: 'https://raw.com', publishedAt: new Date(), summary: 's', whyItMatters: 'w', useCases: [], category: 'openai', relevanceScore: 0.5, dedupeGroupId: 'g' });
    expect(repo.getByCategory('openai')).toHaveLength(1);
    expect(repo.getByCategory('google')).toHaveLength(0);
  });
});

// ── DigestRepo ──────────────────────────────────────────────────────────────

describe('DigestRepo', () => {
  let repo: DigestRepo;
  beforeEach(() => { setup(); repo = new DigestRepo(db); });
  afterEach(teardown);

  const makeDigest = (pubDate: string) => ({
    publishedAt: new Date(pubDate),
    editorialIntro: 'intro',
    totalArticleCount: 5,
    categoryCount: 3,
    periodStart: new Date('2024-01-01'),
    periodEnd: new Date('2024-01-03'),
    htmlContent: '<html></html>',
    plainTextContent: 'text',
    archiveUrl: null,
  });

  it('should create and retrieve a digest', () => {
    const d = repo.create(makeDigest('2024-06-01'));
    expect(repo.getById(d.id)).toBeDefined();
  });

  it('should return digests ordered by publication date descending', () => {
    repo.create(makeDigest('2024-01-01'));
    repo.create(makeDigest('2024-06-01'));
    repo.create(makeDigest('2024-03-01'));
    const all = repo.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].publishedAt.getTime()).toBeGreaterThan(all[1].publishedAt.getTime());
    expect(all[1].publishedAt.getTime()).toBeGreaterThan(all[2].publishedAt.getTime());
  });

  it('should return the latest digest', () => {
    repo.create(makeDigest('2024-01-01'));
    repo.create(makeDigest('2024-12-01'));
    const latest = repo.getLatest()!;
    expect(latest.publishedAt).toEqual(new Date('2024-12-01'));
  });

  it('should update archive URL', () => {
    const d = repo.create(makeDigest('2024-06-01'));
    repo.updateArchiveUrl(d.id, 'https://archive.com/d1');
    expect(repo.getById(d.id)!.archiveUrl).toBe('https://archive.com/d1');
  });
});

// ── SubscriberRepo ──────────────────────────────────────────────────────────

describe('SubscriberRepo', () => {
  let repo: SubscriberRepo;
  beforeEach(() => { setup(); repo = new SubscriberRepo(db); });
  afterEach(teardown);

  it('should create and retrieve a subscriber', () => {
    const sub = repo.create({ email: 'test@example.com', status: 'pending', subscribedAt: new Date(), consecutiveBounces: 0 });
    expect(repo.getById(sub.id)!.email).toBe('test@example.com');
  });

  it('should find subscriber by email', () => {
    repo.create({ email: 'find@me.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 });
    expect(repo.getByEmail('find@me.com')).toBeDefined();
    expect(repo.getByEmail('nope@me.com')).toBeUndefined();
  });

  it('should query active subscribers', () => {
    repo.create({ email: 'a@a.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 });
    repo.create({ email: 'b@b.com', status: 'inactive', subscribedAt: new Date(), consecutiveBounces: 0 });
    repo.create({ email: 'c@c.com', status: 'pending', subscribedAt: new Date(), consecutiveBounces: 0 });
    expect(repo.getActive()).toHaveLength(1);
  });

  it('should increment bounces and deactivate at threshold', () => {
    const sub = repo.create({ email: 'bounce@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 });
    const after1 = repo.incrementBounces(sub.id)!;
    expect(after1.consecutiveBounces).toBe(1);
    expect(after1.status).toBe('active');

    const after2 = repo.incrementBounces(sub.id)!;
    expect(after2.consecutiveBounces).toBe(2);
    expect(after2.status).toBe('inactive');
  });

  it('should reset bounces', () => {
    const sub = repo.create({ email: 'reset@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 1 });
    repo.resetBounces(sub.id);
    expect(repo.getById(sub.id)!.consecutiveBounces).toBe(0);
  });

  it('should update status with unsubscribedAt', () => {
    const sub = repo.create({ email: 'unsub@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 });
    const now = new Date();
    repo.updateStatus(sub.id, 'inactive', now);
    const updated = repo.getById(sub.id)!;
    expect(updated.status).toBe('inactive');
    expect(updated.unsubscribedAt).toBeDefined();
  });
});

// ── ToolRadarRepo ───────────────────────────────────────────────────────────

describe('ToolRadarRepo', () => {
  let repo: ToolRadarRepo;
  let rawArticleId: string;

  beforeEach(() => {
    setup();
    const srcRepo = new SourceRepo(db);
    const artRepo = new ArticleRepo(db);
    const sid = srcRepo.create({ name: 'S', url: 'https://s.com', type: 'tool-radar', categories: [], enabled: true }).id;
    rawArticleId = artRepo.create({ sourceId: sid, title: 'Tool', url: 'https://tool.com', publishedAt: new Date(), rawContent: 'c', fetchedAt: new Date(), isToolRadarCandidate: true }).id;
    repo = new ToolRadarRepo(db);
  });
  afterEach(teardown);

  it('should create and retrieve a tool radar entry', () => {
    const entry = repo.create({ rawArticleId, name: 'CoolTool', oneLiner: 'Does stuff', description: 'Longer desc', bestFor: 'Solo founders', url: 'https://tool.com' });
    expect(repo.getById(entry.id)!.name).toBe('CoolTool');
  });
});

// ── DeliveryLogRepo ─────────────────────────────────────────────────────────

describe('DeliveryLogRepo', () => {
  let repo: DeliveryLogRepo;
  let digestId: string;
  let subscriberId: string;

  beforeEach(() => {
    setup();
    const digestRepo = new DigestRepo(db);
    const subRepo = new SubscriberRepo(db);
    digestId = digestRepo.create({
      publishedAt: new Date(), editorialIntro: 'i', totalArticleCount: 1, categoryCount: 1,
      periodStart: new Date(), periodEnd: new Date(), htmlContent: '<h>', plainTextContent: 't', archiveUrl: null,
    }).id;
    subscriberId = subRepo.create({ email: 'dl@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 }).id;
    repo = new DeliveryLogRepo(db);
  });
  afterEach(teardown);

  it('should create and query delivery logs by digest', () => {
    repo.create({ digestId, subscriberId, status: 'sent', error: null, sentAt: new Date() });
    const logs = repo.getByDigestId(digestId);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
  });

  it('should query delivery logs by subscriber', () => {
    repo.create({ digestId, subscriberId, status: 'failed', error: 'timeout', sentAt: new Date() });
    const logs = repo.getBySubscriberId(subscriberId);
    expect(logs).toHaveLength(1);
    expect(logs[0].error).toBe('timeout');
  });
});
