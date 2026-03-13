import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawArticle, LLMConfig } from '../../../src/types';

vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import { deduplicate, groupByTitleSimilarity, jaccardSimilarity } from '../../../src/curator/deduplicator';
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
    publishedAt: new Date('2025-01-15'),
    rawContent: overrides.rawContent ?? 'Some content about AI.',
    fetchedAt: new Date(),
    isToolRadarCandidate: false,
    ...overrides,
  };
}

describe('deduplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
  });

  it('returns empty array for empty input', async () => {
    const result = await deduplicate([], defaultLLMConfig);
    expect(result).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('returns single article with dedupeGroupId for single input', async () => {
    const article = makeArticle({ id: 'a1' });
    const result = await deduplicate([article], defaultLLMConfig);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
    expect((result[0] as any).dedupeGroupId).toBeDefined();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('uses LLM to group duplicates and keeps one per group', async () => {
    mockCallLLM.mockResolvedValue('[[0, 1], [2]]');

    const articles = [
      makeArticle({ id: 'a1', title: 'GPT-5 released by OpenAI', rawContent: 'Short content.' }),
      makeArticle({ id: 'a2', title: 'OpenAI launches GPT-5', rawContent: 'Much longer content about the GPT-5 release with more details.' }),
      makeArticle({ id: 'a3', title: 'Claude 4 benchmarks released' }),
    ];

    const result = await deduplicate(articles, defaultLLMConfig);

    expect(result).toHaveLength(2);
    // a2 should be picked from group [0,1] because it has longer content
    const ids = result.map(r => r.id);
    expect(ids).toContain('a2');
    expect(ids).toContain('a3');
    expect(ids).not.toContain('a1');
  });

  it('falls back to title similarity when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const articles = [
      makeArticle({ id: 'a1', title: 'OpenAI releases GPT-5 API', rawContent: 'Short.' }),
      makeArticle({ id: 'a2', title: 'OpenAI releases GPT-5 API today', rawContent: 'Longer content here with more details.' }),
      makeArticle({ id: 'a3', title: 'Anthropic launches Claude 4' }),
    ];

    const result = await deduplicate(articles, defaultLLMConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to title-similarity heuristic')
    );
    // a1 and a2 should be grouped (high title overlap), a3 is separate
    expect(result).toHaveLength(2);
    // a2 should be the representative (longer content)
    const ids = result.map(r => r.id);
    expect(ids).toContain('a2');
    expect(ids).toContain('a3');

    warnSpy.mockRestore();
  });

  it('assigns unique dedupeGroupId to each group', async () => {
    mockCallLLM.mockResolvedValue('[[0], [1], [2]]');

    const articles = [
      makeArticle({ id: 'a1', title: 'Article one' }),
      makeArticle({ id: 'a2', title: 'Article two' }),
      makeArticle({ id: 'a3', title: 'Article three' }),
    ];

    const result = await deduplicate(articles, defaultLLMConfig);
    const groupIds = result.map(r => (r as any).dedupeGroupId);
    expect(new Set(groupIds).size).toBe(3);
  });

  it('selects earliest published article on content length tie', async () => {
    mockCallLLM.mockResolvedValue('[[0, 1]]');

    const articles = [
      makeArticle({ id: 'a1', title: 'Same event', rawContent: 'Same length!', publishedAt: new Date('2025-01-10') }),
      makeArticle({ id: 'a2', title: 'Same event', rawContent: 'Same length!', publishedAt: new Date('2025-01-15') }),
    ];

    const result = await deduplicate(articles, defaultLLMConfig);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });
});

describe('groupByTitleSimilarity', () => {
  it('groups articles with >60% word overlap', () => {
    const articles = [
      makeArticle({ title: 'OpenAI releases GPT-5 API' }),
      makeArticle({ title: 'OpenAI releases GPT-5 API today' }),
      makeArticle({ title: 'Anthropic launches Claude 4' }),
    ];

    const groups = groupByTitleSimilarity(articles);
    // First two should be grouped, third is separate
    expect(groups).toHaveLength(2);
    const bigGroup = groups.find(g => g.length > 1)!;
    expect(bigGroup).toContain(0);
    expect(bigGroup).toContain(1);
  });

  it('keeps dissimilar articles in separate groups', () => {
    const articles = [
      makeArticle({ title: 'OpenAI releases GPT-5' }),
      makeArticle({ title: 'Anthropic launches Claude 4' }),
      makeArticle({ title: 'Google announces Gemini Pro' }),
    ];

    const groups = groupByTitleSimilarity(articles);
    expect(groups).toHaveLength(3);
    groups.forEach(g => expect(g).toHaveLength(1));
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    const a = new Set(['openai', 'gpt', 'release']);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['openai', 'gpt']);
    const b = new Set(['anthropic', 'claude']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    const a = new Set(['openai', 'releases', 'gpt5', 'api']);
    const b = new Set(['openai', 'releases', 'gpt5', 'api', 'today']);
    // intersection = 4, union = 5 → 0.8
    expect(jaccardSimilarity(a, b)).toBe(0.8);
  });

  it('returns 1 for two empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });
});
