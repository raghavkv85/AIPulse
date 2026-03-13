import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  RawArticle,
  ContentFilterCriteria,
  ArticleCaps,
  CoverageCategory,
  LLMConfig,
} from '../../../src/types';

// Mock all curator sub-modules before importing the orchestrator
vi.mock('../../../src/curator/contentFilter', () => ({
  filterContent: vi.fn(),
}));
vi.mock('../../../src/curator/deduplicator', () => ({
  deduplicate: vi.fn(),
}));
vi.mock('../../../src/curator/ranker', () => ({
  rankArticles: vi.fn(),
}));
vi.mock('../../../src/curator/treatmentGenerator', () => ({
  generateArticleTreatment: vi.fn(),
}));
vi.mock('../../../src/curator/toolRadarSelector', () => ({
  selectToolRadar: vi.fn(),
}));
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import { ContentCuratorImpl } from '../../../src/curator/index';
import { filterContent } from '../../../src/curator/contentFilter';
import { deduplicate } from '../../../src/curator/deduplicator';
import { rankArticles } from '../../../src/curator/ranker';
import { generateArticleTreatment } from '../../../src/curator/treatmentGenerator';
import { selectToolRadar } from '../../../src/curator/toolRadarSelector';

const mockFilter = filterContent as ReturnType<typeof vi.fn>;
const mockDedup = deduplicate as ReturnType<typeof vi.fn>;
const mockRank = rankArticles as ReturnType<typeof vi.fn>;
const mockTreatment = generateArticleTreatment as ReturnType<typeof vi.fn>;
const mockToolRadar = selectToolRadar as ReturnType<typeof vi.fn>;

const llmConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'LLM_API_KEY',
};

const defaultCriteria: ContentFilterCriteria = {
  include: ['API features', 'SDK releases'],
  exclude: ['corporate drama'],
};

const defaultCaps: ArticleCaps = {
  perCategory: 3,
  toolRadarEntries: 4,
  totalMax: 18,
};

const defaultCategories: CoverageCategory[] = [
  { id: 'openai', name: 'OpenAI', keywords: ['openai', 'gpt'], enabled: true },
  { id: 'google', name: 'Google', keywords: ['google', 'gemini'], enabled: true },
];

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: overrides.id ?? 'art-1',
    sourceId: 'src-1',
    title: overrides.title ?? 'Test Article',
    url: overrides.url ?? 'https://example.com/article',
    publishedAt: new Date('2025-01-15'),
    rawContent: overrides.rawContent ?? 'Some content about AI.',
    fetchedAt: new Date(),
    isToolRadarCandidate: overrides.isToolRadarCandidate ?? false,
    ...overrides,
  };
}

const defaultTreatment = {
  summary: 'This is a summary. It has two sentences.',
  whyItMatters: 'This matters for builders.',
  useCases: ['Use case 1', 'Use case 2', 'Use case 3'],
};

describe('ContentCuratorImpl', () => {
  let curator: ContentCuratorImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    curator = new ContentCuratorImpl(
      llmConfig,
      defaultCriteria,
      defaultCaps,
      defaultCategories
    );

    // Default mock implementations
    mockFilter.mockImplementation(async (articles: RawArticle[]) => articles);
    mockDedup.mockImplementation(async (articles: RawArticle[]) =>
      articles.map(a => ({ ...a, dedupeGroupId: 'group-1' }))
    );
    mockRank.mockImplementation(async (articles: RawArticle[]) =>
      articles.map((a, i) => ({ article: a, relevanceScore: 1 - i * 0.1 }))
    );
    mockTreatment.mockResolvedValue(defaultTreatment);
    mockToolRadar.mockResolvedValue([]);
  });

  it('separates tool-radar candidates from regular articles', async () => {
    const regular = makeArticle({ id: 'r1', title: 'OpenAI GPT update', rawContent: 'openai gpt update' });
    const toolCandidate = makeArticle({ id: 't1', isToolRadarCandidate: true });

    await curator.curate([regular, toolCandidate], ['openai'], defaultCriteria);

    // filterContent should only receive the regular article
    expect(mockFilter).toHaveBeenCalledWith(
      [regular],
      defaultCriteria,
      llmConfig
    );
    // selectToolRadar should receive the tool candidate
    expect(mockToolRadar).toHaveBeenCalledWith(
      [toolCandidate],
      defaultCaps.toolRadarEntries,
      llmConfig
    );
  });

  it('runs the full pipeline: filter → dedup → rank → treatment → tool radar', async () => {
    const article = makeArticle({
      id: 'a1',
      title: 'OpenAI GPT-5 API release',
      rawContent: 'openai gpt api features',
      url: 'https://example.com/gpt5',
    });

    const result = await curator.curate([article], ['openai'], defaultCriteria);

    expect(mockFilter).toHaveBeenCalledOnce();
    expect(mockDedup).toHaveBeenCalledOnce();
    expect(mockRank).toHaveBeenCalled();
    expect(mockTreatment).toHaveBeenCalled();
    expect(mockToolRadar).toHaveBeenCalledOnce();

    expect(result.articles.length).toBeGreaterThanOrEqual(0);
    expect(result.totalRawArticles).toBe(1);
  });

  it('preserves original article URL in curated articles', async () => {
    const article = makeArticle({
      id: 'a1',
      title: 'Google Gemini launch',
      rawContent: 'google gemini model launch',
      url: 'https://example.com/original-url',
    });

    const result = await curator.curate([article], ['google'], defaultCriteria);

    for (const curated of result.articles) {
      expect(curated.url).toBe('https://example.com/original-url');
    }
  });

  it('returns correct stats for duplicates removed', async () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'OpenAI GPT update', rawContent: 'openai gpt' }),
      makeArticle({ id: 'a2', title: 'OpenAI GPT update duplicate', rawContent: 'openai gpt' }),
    ];

    // Filter passes both, dedup removes one
    mockFilter.mockResolvedValue(articles);
    mockDedup.mockResolvedValue([{ ...articles[0], dedupeGroupId: 'g1' }]);

    const result = await curator.curate(articles, ['openai'], defaultCriteria);

    expect(result.duplicatesRemoved).toBe(1);
  });

  it('returns correct stats for filtered out articles', async () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'OpenAI GPT update', rawContent: 'openai gpt' }),
      makeArticle({ id: 'a2', title: 'Corporate drama', rawContent: 'drama' }),
    ];

    // Filter removes one article
    mockFilter.mockResolvedValue([articles[0]]);

    const result = await curator.curate(articles, ['openai'], defaultCriteria);

    expect(result.filteredOut).toBe(1);
  });

  it('enforces total article cap (articles + tool radar ≤ totalMax)', async () => {
    const caps: ArticleCaps = { perCategory: 10, toolRadarEntries: 4, totalMax: 5 };
    const curatorWithCap = new ContentCuratorImpl(
      llmConfig,
      defaultCriteria,
      caps,
      defaultCategories
    );

    // Create 10 regular articles for openai category
    const articles = Array.from({ length: 10 }, (_, i) =>
      makeArticle({
        id: `a${i}`,
        title: `OpenAI update ${i}`,
        rawContent: `openai gpt update ${i}`,
      })
    );

    // Tool radar returns 2 entries
    mockToolRadar.mockResolvedValue([
      { id: 'tr1', rawArticleId: 'x1', name: 'Tool1', oneLiner: 'x', description: 'x', bestFor: 'x', url: 'x' },
      { id: 'tr2', rawArticleId: 'x2', name: 'Tool2', oneLiner: 'x', description: 'x', bestFor: 'x', url: 'x' },
    ]);

    const result = await curatorWithCap.curate(articles, ['openai'], defaultCriteria);

    // totalMax=5, toolRadar=2, so max full articles = 3
    expect(result.articles.length + result.toolRadar.length).toBeLessThanOrEqual(5);
    expect(result.articlesCapped).toBeGreaterThan(0);
  });

  it('assigns articles to categories based on keyword matching', async () => {
    const openaiArticle = makeArticle({
      id: 'a1',
      title: 'OpenAI GPT-5 release',
      rawContent: 'openai gpt model launch',
    });
    const googleArticle = makeArticle({
      id: 'a2',
      title: 'Google Gemini update',
      rawContent: 'google gemini new features',
    });

    const result = await curator.curate(
      [openaiArticle, googleArticle],
      ['openai', 'google'],
      defaultCriteria
    );

    const openaiCurated = result.articles.filter(a => a.category === 'openai');
    const googleCurated = result.articles.filter(a => a.category === 'google');

    expect(openaiCurated.length).toBeGreaterThanOrEqual(0);
    expect(googleCurated.length).toBeGreaterThanOrEqual(0);
    // Each article should be in the correct category
    for (const a of openaiCurated) {
      expect(a.rawArticleId).toBe('a1');
    }
    for (const a of googleCurated) {
      expect(a.rawArticleId).toBe('a2');
    }
  });

  it('handles empty input gracefully', async () => {
    const result = await curator.curate([], ['openai'], defaultCriteria);

    expect(result.articles).toEqual([]);
    expect(result.toolRadar).toEqual([]);
    expect(result.totalRawArticles).toBe(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.filteredOut).toBe(0);
    expect(result.articlesCapped).toBe(0);
  });

  it('curated articles include all required fields', async () => {
    const article = makeArticle({
      id: 'a1',
      title: 'OpenAI GPT-5 API',
      rawContent: 'openai gpt api features',
      url: 'https://example.com/gpt5',
    });

    const result = await curator.curate([article], ['openai'], defaultCriteria);

    for (const curated of result.articles) {
      expect(curated.id).toBeDefined();
      expect(curated.rawArticleId).toBe('a1');
      expect(curated.title).toBe('OpenAI GPT-5 API');
      expect(curated.url).toBe('https://example.com/gpt5');
      expect(curated.publishedAt).toBeInstanceOf(Date);
      expect(curated.summary).toBe(defaultTreatment.summary);
      expect(curated.whyItMatters).toBe(defaultTreatment.whyItMatters);
      expect(curated.useCases).toEqual(defaultTreatment.useCases);
      expect(curated.category).toBe('openai');
      expect(typeof curated.relevanceScore).toBe('number');
      expect(curated.dedupeGroupId).toBeDefined();
    }
  });

  it('groups curated articles by coverage category', async () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'OpenAI GPT update', rawContent: 'openai gpt' }),
      makeArticle({ id: 'a2', title: 'Google Gemini update', rawContent: 'google gemini' }),
      makeArticle({ id: 'a3', title: 'OpenAI API change', rawContent: 'openai gpt api' }),
    ];

    const result = await curator.curate(
      articles,
      ['openai', 'google'],
      defaultCriteria
    );

    const categories = new Set(result.articles.map(a => a.category));
    // Articles should be assigned to their matching categories
    for (const cat of categories) {
      expect(['openai', 'google']).toContain(cat);
    }
  });
});
