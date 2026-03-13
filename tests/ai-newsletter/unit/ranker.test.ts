import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawArticle, LLMConfig } from '../../../src/types';

vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import { rankArticles, rankByRecency } from '../../../src/curator/ranker';
import { callLLM } from '../../../src/curator/llmClient';

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const defaultLLMConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'LLM_API_KEY',
};

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: overrides.id ?? 'art-1',
    sourceId: 'src-1',
    title: overrides.title ?? 'Test Article',
    url: 'https://example.com/article',
    publishedAt: overrides.publishedAt ?? new Date('2025-01-15'),
    rawContent: overrides.rawContent ?? 'Some content about AI.',
    fetchedAt: new Date(),
    isToolRadarCandidate: false,
    ...overrides,
  };
}

describe('rankArticles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
  });

  it('returns empty array for empty input', async () => {
    const result = await rankArticles([], 'OpenAI', 3, defaultLLMConfig);
    expect(result).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('uses LLM scores and sorts descending', async () => {
    mockCallLLM.mockResolvedValue('[0.3, 0.9, 0.6]');

    const articles = [
      makeArticle({ id: 'a1', title: 'Low relevance article' }),
      makeArticle({ id: 'a2', title: 'High relevance article' }),
      makeArticle({ id: 'a3', title: 'Medium relevance article' }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 3, defaultLLMConfig);

    expect(result).toHaveLength(3);
    expect(result[0].article.id).toBe('a2');
    expect(result[0].relevanceScore).toBe(0.9);
    expect(result[1].article.id).toBe('a3');
    expect(result[1].relevanceScore).toBe(0.6);
    expect(result[2].article.id).toBe('a1');
    expect(result[2].relevanceScore).toBe(0.3);
  });

  it('applies per-category cap when more articles than cap', async () => {
    mockCallLLM.mockResolvedValue('[0.9, 0.7, 0.5, 0.3, 0.1]');

    const articles = [
      makeArticle({ id: 'a1' }),
      makeArticle({ id: 'a2' }),
      makeArticle({ id: 'a3' }),
      makeArticle({ id: 'a4' }),
      makeArticle({ id: 'a5' }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 3, defaultLLMConfig);

    expect(result).toHaveLength(3);
    expect(result[0].relevanceScore).toBe(0.9);
    expect(result[1].relevanceScore).toBe(0.7);
    expect(result[2].relevanceScore).toBe(0.5);
  });

  it('returns all articles when count <= cap', async () => {
    mockCallLLM.mockResolvedValue('[0.8, 0.6]');

    const articles = [
      makeArticle({ id: 'a1' }),
      makeArticle({ id: 'a2' }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 3, defaultLLMConfig);
    expect(result).toHaveLength(2);
  });

  it('falls back to recency ranking when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const articles = [
      makeArticle({ id: 'a1', publishedAt: new Date('2025-01-10') }),
      makeArticle({ id: 'a2', publishedAt: new Date('2025-01-15') }),
      makeArticle({ id: 'a3', publishedAt: new Date('2025-01-12') }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 3, defaultLLMConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to recency-only ranking')
    );
    // Most recent first
    expect(result[0].article.id).toBe('a2');
    expect(result[1].article.id).toBe('a3');
    expect(result[2].article.id).toBe('a1');

    warnSpy.mockRestore();
  });

  it('falls back to recency and still applies cap', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const articles = [
      makeArticle({ id: 'a1', publishedAt: new Date('2025-01-10') }),
      makeArticle({ id: 'a2', publishedAt: new Date('2025-01-15') }),
      makeArticle({ id: 'a3', publishedAt: new Date('2025-01-12') }),
      makeArticle({ id: 'a4', publishedAt: new Date('2025-01-14') }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 2, defaultLLMConfig);

    expect(result).toHaveLength(2);
    // Top 2 most recent
    expect(result[0].article.id).toBe('a2');
    expect(result[1].article.id).toBe('a4');
  });

  it('clamps LLM scores to [0, 1] range', async () => {
    mockCallLLM.mockResolvedValue('[1.5, -0.3, 0.7]');

    const articles = [
      makeArticle({ id: 'a1' }),
      makeArticle({ id: 'a2' }),
      makeArticle({ id: 'a3' }),
    ];

    const result = await rankArticles(articles, 'OpenAI', 3, defaultLLMConfig);

    expect(result[0].relevanceScore).toBe(1.0);
    expect(result[1].relevanceScore).toBe(0.7);
    expect(result[2].relevanceScore).toBe(0);
  });
});

describe('rankByRecency', () => {
  it('returns empty array for empty input', () => {
    expect(rankByRecency([])).toEqual([]);
  });

  it('assigns score 1.0 to single article', () => {
    const articles = [makeArticle({ id: 'a1' })];
    const result = rankByRecency(articles);
    expect(result).toHaveLength(1);
    expect(result[0].relevanceScore).toBe(1.0);
  });

  it('ranks most recent first with decreasing scores', () => {
    const articles = [
      makeArticle({ id: 'a1', publishedAt: new Date('2025-01-10') }),
      makeArticle({ id: 'a2', publishedAt: new Date('2025-01-15') }),
      makeArticle({ id: 'a3', publishedAt: new Date('2025-01-12') }),
    ];

    const result = rankByRecency(articles);

    expect(result[0].article.id).toBe('a2');
    expect(result[1].article.id).toBe('a3');
    expect(result[2].article.id).toBe('a1');
    expect(result[0].relevanceScore).toBeGreaterThan(result[1].relevanceScore);
    expect(result[1].relevanceScore).toBeGreaterThan(result[2].relevanceScore);
  });
});
