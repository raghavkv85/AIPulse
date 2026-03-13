import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CategoryManager } from '../../../src/config/categoryManager';
import type { CoverageCategory } from '../../../src/types';

function makeCategory(overrides: Partial<CoverageCategory> = {}): CoverageCategory {
  return {
    id: 'test-cat',
    name: 'Test Category',
    keywords: ['test'],
    enabled: true,
    ...overrides,
  };
}

describe('CategoryManager', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catmgr-'));
    tmpFile = path.join(tmpDir, 'categories.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns initial categories via getCategories', () => {
    const cats = [makeCategory({ id: 'a' }), makeCategory({ id: 'b' })];
    const mgr = new CategoryManager(cats);
    expect(mgr.getCategories()).toEqual(cats);
  });

  it('does not mutate the original array', () => {
    const cats = [makeCategory({ id: 'a' })];
    const mgr = new CategoryManager(cats);
    mgr.addCategory(makeCategory({ id: 'b' }));
    expect(cats).toHaveLength(1);
  });

  it('adds a new category', () => {
    const mgr = new CategoryManager([]);
    const cat = makeCategory({ id: 'new' });
    mgr.addCategory(cat);
    expect(mgr.getCategories()).toHaveLength(1);
    expect(mgr.getCategories()[0].id).toBe('new');
  });

  it('ignores duplicate category by id', () => {
    const mgr = new CategoryManager([makeCategory({ id: 'dup' })]);
    mgr.addCategory(makeCategory({ id: 'dup', name: 'Different Name' }));
    expect(mgr.getCategories()).toHaveLength(1);
  });

  it('removes a category by id', () => {
    const mgr = new CategoryManager([
      makeCategory({ id: 'keep' }),
      makeCategory({ id: 'remove' }),
    ]);
    mgr.removeCategory('remove');
    expect(mgr.getCategories()).toHaveLength(1);
    expect(mgr.getCategories()[0].id).toBe('keep');
  });

  it('does nothing when removing a non-existent category', () => {
    const mgr = new CategoryManager([makeCategory({ id: 'a' })]);
    mgr.removeCategory('nonexistent');
    expect(mgr.getCategories()).toHaveLength(1);
  });

  it('returns only enabled categories from getEnabledCategories', () => {
    const mgr = new CategoryManager([
      makeCategory({ id: 'on', enabled: true }),
      makeCategory({ id: 'off', enabled: false }),
    ]);
    const enabled = mgr.getEnabledCategories();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe('on');
  });

  it('persists categories to file on add when configPath is set', () => {
    const mgr = new CategoryManager([], tmpFile);
    mgr.addCategory(makeCategory({ id: 'persisted' }));
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    const saved = JSON.parse(raw) as CoverageCategory[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('persisted');
  });

  it('persists categories to file on remove when configPath is set', () => {
    const mgr = new CategoryManager(
      [makeCategory({ id: 'a' }), makeCategory({ id: 'b' })],
      tmpFile,
    );
    // Initial persist via add won't happen, so persist manually first
    mgr.persistToFile(tmpFile);
    mgr.removeCategory('a');
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    const saved = JSON.parse(raw) as CoverageCategory[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('b');
  });

  it('persistToFile writes valid JSON', () => {
    const cats = [makeCategory({ id: 'x', keywords: ['a', 'b'] })];
    const mgr = new CategoryManager(cats);
    mgr.persistToFile(tmpFile);
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('loadFromFile replaces in-memory categories', () => {
    const initial = [makeCategory({ id: 'old' })];
    const mgr = new CategoryManager(initial);

    const fileData: CoverageCategory[] = [
      makeCategory({ id: 'loaded-1' }),
      makeCategory({ id: 'loaded-2' }),
    ];
    fs.writeFileSync(tmpFile, JSON.stringify(fileData), 'utf-8');

    mgr.loadFromFile(tmpFile);
    expect(mgr.getCategories()).toHaveLength(2);
    expect(mgr.getCategories().map((c) => c.id)).toEqual(['loaded-1', 'loaded-2']);
  });

  it('round-trips through persist and load', () => {
    const cats = [
      makeCategory({ id: 'rt-1', name: 'Round Trip 1', keywords: ['k1', 'k2'], enabled: true }),
      makeCategory({ id: 'rt-2', name: 'Round Trip 2', keywords: ['k3'], enabled: false }),
    ];
    const writer = new CategoryManager(cats);
    writer.persistToFile(tmpFile);

    const reader = new CategoryManager([]);
    reader.loadFromFile(tmpFile);
    expect(reader.getCategories()).toEqual(cats);
  });
});
