import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawArticle, ContentFilterCriteria, LLMConfig } from '../../../src/types';

// Mock the llmClient before importing contentFilter
vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import { filterContent, filterWithKeywords } from '../../../src/curator/contentFilter';
import { callLLM } from '../../../src/curator/llmClient';

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const defaultCriteria: ContentFilterCriteria = {
  include: [
    'API features', 'SDK releases', 'model launches', 'dev tools',
    'frameworks', 'infrastructure updates', 'open-source models', 'pricing changes',
  ],
  exclude: [
    'political', 'regulatory', 'corporate drama', 'funding without tech',
    'consumer features',
  ],
};

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

describe('filterContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
  });

  it('returns empty array for empty input', async () => {
    const result = await filterContent([], defaultCriteria, defaultLLMConfig);
    expect(result).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('uses LLM to classify articles and returns included ones', async () => {
    mockCallLLM.mockResolvedValue('["include", "exclude"]');

    const articles = [
      makeArticle({ id: 'a1', title: 'GPT-5 API release' }),
      makeArticle({ id: 'a2', title: 'OpenAI CEO drama' }),
    ];

    const result = await filterContent(articles, defaultCriteria, defaultLLMConfig);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
    expect(mockCallLLM).toHaveBeenCalledOnce();
  });

  it('falls back to keyword filtering when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const articles = [
      makeArticle({ id: 'a1', title: 'New SDK releases for Claude API', rawContent: 'SDK releases details' }),
      makeArticle({ id: 'a2', title: 'Corporate drama at tech company', rawContent: 'corporate drama unfolds' }),
    ];

    const result = await filterContent(articles, defaultCriteria, defaultLLMConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to keyword-based filtering')
    );
    // a1 matches "SDK releases" include keyword, a2 matches "corporate drama" exclude keyword
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');

    warnSpy.mockRestore();
  });

  it('handles LLM returning all includes', async () => {
    mockCallLLM.mockResolvedValue('["include", "include", "include"]');

    const articles = [
      makeArticle({ id: 'a1' }),
      makeArticle({ id: 'a2' }),
      makeArticle({ id: 'a3' }),
    ];

    const result = await filterContent(articles, defaultCriteria, defaultLLMConfig);
    expect(result).toHaveLength(3);
  });

  it('handles LLM returning all excludes', async () => {
    mockCallLLM.mockResolvedValue('["exclude", "exclude"]');

    const articles = [
      makeArticle({ id: 'a1' }),
      makeArticle({ id: 'a2' }),
    ];

    const result = await filterContent(articles, defaultCriteria, defaultLLMConfig);
    expect(result).toHaveLength(0);
  });
});

describe('filterWithKeywords', () => {
  it('includes articles matching include keywords', () => {
    const articles = [
      makeArticle({ title: 'New API features for developers', rawContent: 'Great new API features.' }),
    ];

    const result = filterWithKeywords(articles, defaultCriteria);
    expect(result).toHaveLength(1);
  });

  it('excludes articles matching exclude keywords', () => {
    const articles = [
      makeArticle({ title: 'Political regulatory changes in AI', rawContent: 'New political regulations.' }),
    ];

    const result = filterWithKeywords(articles, defaultCriteria);
    expect(result).toHaveLength(0);
  });

  it('excludes articles that match both include and exclude keywords', () => {
    const articles = [
      makeArticle({
        title: 'New API features amid corporate drama',
        rawContent: 'API features released during corporate drama.',
      }),
    ];

    const result = filterWithKeywords(articles, defaultCriteria);
    expect(result).toHaveLength(0);
  });

  it('correctly classifies known examples', () => {
    const articles = [
      makeArticle({ id: 'include-1', title: 'GPT-5 API release', rawContent: 'OpenAI releases new API features for GPT-5.' }),
      makeArticle({ id: 'exclude-1', title: 'OpenAI CEO drama', rawContent: 'Corporate drama at OpenAI continues.' }),
      makeArticle({ id: 'include-2', title: 'New open-source models benchmark', rawContent: 'Open-source models show impressive results.' }),
      makeArticle({ id: 'exclude-2', title: 'AI funding round', rawContent: 'Startup raises $100M funding without tech substance.' }),
    ];

    const result = filterWithKeywords(articles, defaultCriteria);
    const ids = result.map(a => a.id);

    expect(ids).toContain('include-1');
    expect(ids).not.toContain('exclude-1');
    expect(ids).toContain('include-2');
    expect(ids).not.toContain('exclude-2');
  });

  it('handles empty criteria gracefully', () => {
    const articles = [makeArticle({ title: 'Any article' })];
    const emptyCriteria: ContentFilterCriteria = { include: [], exclude: [] };

    const result = filterWithKeywords(articles, emptyCriteria);
    // With no include keywords, all articles pass the include check; no exclude keywords means nothing excluded
    expect(result).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    const articles = [
      makeArticle({ title: 'NEW SDK RELEASES', rawContent: 'MAJOR SDK RELEASES TODAY' }),
    ];

    const result = filterWithKeywords(articles, defaultCriteria);
    expect(result).toHaveLength(1);
  });

  it('handles empty article list', () => {
    const result = filterWithKeywords([], defaultCriteria);
    expect(result).toHaveLength(0);
  });
});
