import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawArticle, LLMConfig } from '../../../src/types';

vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import {
  generateArticleTreatment,
  generateFallback,
  countSentences,
} from '../../../src/curator/treatmentGenerator';
import { callLLM } from '../../../src/curator/llmClient';

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const defaultLLMConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'LLM_API_KEY',
};

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: 'art-1',
    sourceId: 'src-1',
    title: 'Claude 4 API Now Available',
    url: 'https://example.com/claude-4',
    publishedAt: new Date('2025-01-15'),
    rawContent:
      'Anthropic released the Claude 4 API today. The new model supports 200K context windows. Developers can access it through the existing SDK. It offers improved reasoning and coding capabilities.',
    fetchedAt: new Date(),
    isToolRadarCandidate: false,
    ...overrides,
  };
}

const validLLMResponse = JSON.stringify({
  summary:
    'Anthropic released the Claude 4 API with 200K context window support. Developers can access it through the existing SDK with improved reasoning capabilities.',
  whyItMatters:
    'This significantly expands what builders can do with a single API call. The 200K context window means you can process entire codebases or long documents without chunking, reducing complexity and cost for RAG pipelines.',
  useCases: [
    'Build a codebase Q&A tool that ingests entire repos in one prompt',
    'Create a document summarizer that handles full legal contracts or research papers',
    'Implement an AI code reviewer that sees the full project context',
  ],
});

describe('generateArticleTreatment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
  });

  it('generates treatment via LLM with valid response', async () => {
    mockCallLLM.mockResolvedValue(validLLMResponse);

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.summary).toContain('Claude 4 API');
    expect(result.whyItMatters).toBeTruthy();
    expect(result.useCases).toHaveLength(3);
    expect(mockCallLLM).toHaveBeenCalledOnce();
  });

  it('falls back when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const article = makeArticle();
    const result = await generateArticleTreatment(article, defaultLLMConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('using fallback')
    );
    expect(result.summary).toBeTruthy();
    expect(result.whyItMatters).toBe('');
    expect(result.useCases).toEqual([]);

    warnSpy.mockRestore();
  });

  it('falls back when LLM returns invalid JSON', async () => {
    mockCallLLM.mockResolvedValue('This is not JSON at all');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.whyItMatters).toBe('');
    expect(result.useCases).toEqual([]);

    warnSpy.mockRestore();
  });

  it('falls back when LLM response has wrong sentence count', async () => {
    const badResponse = JSON.stringify({
      summary: 'Just one sentence.',
      whyItMatters: 'Some implications.',
      useCases: ['Use case 1', 'Use case 2', 'Use case 3'],
    });
    mockCallLLM.mockResolvedValue(badResponse);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.whyItMatters).toBe('');
    expect(result.useCases).toEqual([]);

    warnSpy.mockRestore();
  });

  it('falls back when LLM response has wrong useCases count', async () => {
    const badResponse = JSON.stringify({
      summary: 'First sentence here. Second sentence here.',
      whyItMatters: 'Some implications.',
      useCases: ['Only one'],
    });
    mockCallLLM.mockResolvedValue(badResponse);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.whyItMatters).toBe('');
    expect(result.useCases).toEqual([]);

    warnSpy.mockRestore();
  });

  it('accepts 4 useCases', async () => {
    const response = JSON.stringify({
      summary: 'First sentence here. Second sentence here.',
      whyItMatters: 'Important implications for builders.',
      useCases: ['UC 1', 'UC 2', 'UC 3', 'UC 4'],
    });
    mockCallLLM.mockResolvedValue(response);

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.useCases).toHaveLength(4);
  });

  it('handles LLM response wrapped in markdown fences', async () => {
    const wrappedResponse = '```json\n' + validLLMResponse + '\n```';
    mockCallLLM.mockResolvedValue(wrappedResponse);

    const result = await generateArticleTreatment(makeArticle(), defaultLLMConfig);

    expect(result.summary).toBeTruthy();
    expect(result.whyItMatters).toBeTruthy();
    expect(result.useCases.length).toBeGreaterThanOrEqual(3);
  });
});

describe('generateFallback', () => {
  it('extracts first sentences from rawContent', () => {
    const article = makeArticle({
      rawContent:
        'First sentence. Second sentence. Third sentence. Fourth sentence.',
    });

    const result = generateFallback(article);

    expect(result.summary).toContain('First sentence.');
    expect(result.summary).toContain('Second sentence.');
    expect(result.summary).toContain('Third sentence.');
    expect(result.summary).not.toContain('Fourth sentence.');
    expect(result.whyItMatters).toBe('');
    expect(result.useCases).toEqual([]);
  });

  it('uses title as summary when rawContent has no sentences', () => {
    const article = makeArticle({ rawContent: '' });

    const result = generateFallback(article);

    expect(result.summary).toBe(article.title);
  });

  it('handles rawContent with fewer than 3 sentences', () => {
    const article = makeArticle({ rawContent: 'Only one sentence.' });

    const result = generateFallback(article);

    expect(result.summary).toBe('Only one sentence.');
  });
});

describe('countSentences', () => {
  it('counts sentences ending with periods', () => {
    expect(countSentences('One. Two. Three.')).toBe(3);
  });

  it('counts sentences ending with exclamation marks', () => {
    expect(countSentences('Wow! Amazing! Great!')).toBe(3);
  });

  it('counts sentences ending with question marks', () => {
    expect(countSentences('What? Why? How?')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countSentences('')).toBe(0);
  });

  it('counts 2 sentences correctly', () => {
    expect(countSentences('First sentence. Second sentence.')).toBe(2);
  });
});
