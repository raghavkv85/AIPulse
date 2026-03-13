import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawArticle, LLMConfig } from '../../../src/types';

vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import { selectToolRadar, selectFallback } from '../../../src/curator/toolRadarSelector';
import { callLLM } from '../../../src/curator/llmClient';

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const defaultLLMConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'LLM_API_KEY',
};

function makeCandidate(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    id: `tool-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: 'src-ph',
    title: 'CoolTool - AI code assistant',
    url: 'https://example.com/cooltool',
    publishedAt: new Date('2025-01-15'),
    rawContent: 'CoolTool is an AI-powered code assistant that helps you write better code. It integrates with VS Code and supports multiple languages.',
    fetchedAt: new Date(),
    isToolRadarCandidate: true,
    ...overrides,
  };
}

function makeCandidates(count: number): RawArticle[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandidate({
      id: `tool-${i}`,
      title: `Tool ${i} - AI helper`,
      url: `https://example.com/tool-${i}`,
      publishedAt: new Date(2025, 0, 15 - i),
      rawContent: `Tool ${i} helps developers build faster. It provides smart suggestions and automates repetitive tasks.`,
    })
  );
}

const validLLMResponse = JSON.stringify([
  {
    index: 0,
    name: 'Tool 0',
    oneLiner: 'AI helper for faster development',
    description: 'Tool 0 helps developers build faster with smart suggestions. It automates repetitive tasks so you can focus on what matters.',
    bestFor: 'Solo founders building MVPs',
  },
  {
    index: 1,
    name: 'Tool 1',
    oneLiner: 'Smart code automation tool',
    description: 'Tool 1 provides intelligent code automation. Great for small teams that need to ship fast.',
    bestFor: 'Small teams shipping AI features',
  },
  {
    index: 2,
    name: 'Tool 2',
    oneLiner: 'Rapid prototyping assistant',
    description: 'Tool 2 accelerates prototyping with AI-powered scaffolding. Perfect for vibe coders.',
    bestFor: 'Vibe coders prototyping fast',
  },
]);

describe('selectToolRadar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
  });

  it('returns empty array for empty candidates', async () => {
    const result = await selectToolRadar([], 4, defaultLLMConfig);
    expect(result).toEqual([]);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('selects tools via LLM with valid response', async () => {
    mockCallLLM.mockResolvedValue(validLLMResponse);
    const candidates = makeCandidates(5);

    const result = await selectToolRadar(candidates, 3, defaultLLMConfig);

    expect(result).toHaveLength(3);
    expect(mockCallLLM).toHaveBeenCalledOnce();

    for (const entry of result) {
      expect(entry.id).toBeTruthy();
      expect(entry.rawArticleId).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.oneLiner).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.bestFor).toBeTruthy();
      expect(entry.url).toBeTruthy();
      // Must NOT have whyItMatters or useCases
      expect(entry).not.toHaveProperty('whyItMatters');
      expect(entry).not.toHaveProperty('useCases');
    }
  });

  it('preserves rawArticleId and url from candidates', async () => {
    mockCallLLM.mockResolvedValue(validLLMResponse);
    const candidates = makeCandidates(5);

    const result = await selectToolRadar(candidates, 3, defaultLLMConfig);

    expect(result[0].rawArticleId).toBe(candidates[0].id);
    expect(result[0].url).toBe(candidates[0].url);
    expect(result[1].rawArticleId).toBe(candidates[1].id);
    expect(result[2].rawArticleId).toBe(candidates[2].id);
  });

  it('falls back when LLM fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('API unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const candidates = makeCandidates(5);

    const result = await selectToolRadar(candidates, 3, defaultLLMConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to basic selection')
    );
    expect(result).toHaveLength(3);

    for (const entry of result) {
      expect(entry.name).toBeTruthy();
      expect(entry.oneLiner).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.bestFor).toBe('Solo founders and small teams');
    }

    warnSpy.mockRestore();
  });

  it('falls back when LLM returns invalid JSON', async () => {
    mockCallLLM.mockResolvedValue('Not valid JSON at all');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const candidates = makeCandidates(4);

    const result = await selectToolRadar(candidates, 3, defaultLLMConfig);

    expect(result).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('caps entries to maxEntries when fewer candidates', async () => {
    const candidates = makeCandidates(2);
    // With only 2 candidates, cap should be 2 even if maxEntries is 4
    const singleResponse = JSON.stringify([
      { index: 0, name: 'T0', oneLiner: 'Desc', description: 'Full desc.', bestFor: 'Solo founders' },
      { index: 1, name: 'T1', oneLiner: 'Desc', description: 'Full desc.', bestFor: 'Small teams' },
    ]);
    mockCallLLM.mockResolvedValue(singleResponse);

    const result = await selectToolRadar(candidates, 4, defaultLLMConfig);

    expect(result).toHaveLength(2);
  });
});

describe('selectFallback', () => {
  it('selects most recent candidates', () => {
    const candidates = makeCandidates(5);
    const result = selectFallback(candidates, 3);

    expect(result).toHaveLength(3);
    // Most recent first (index 0 has latest date)
    expect(result[0].rawArticleId).toBe('tool-0');
    expect(result[1].rawArticleId).toBe('tool-1');
    expect(result[2].rawArticleId).toBe('tool-2');
  });

  it('generates entries with all required fields', () => {
    const candidates = makeCandidates(3);
    const result = selectFallback(candidates, 3);

    for (const entry of result) {
      expect(entry.id).toBeTruthy();
      expect(entry.rawArticleId).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.oneLiner).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.bestFor).toBe('Solo founders and small teams');
      expect(entry.url).toBeTruthy();
      expect(entry).not.toHaveProperty('whyItMatters');
      expect(entry).not.toHaveProperty('useCases');
    }
  });

  it('uses title as name in fallback', () => {
    const candidates = [makeCandidate({ title: 'SuperTool - AI assistant' })];
    const result = selectFallback(candidates, 1);

    expect(result[0].name).toBe('SuperTool - AI assistant');
  });

  it('handles candidates with empty rawContent', () => {
    const candidates = [makeCandidate({ rawContent: '', title: 'EmptyTool' })];
    const result = selectFallback(candidates, 1);

    expect(result[0].oneLiner).toBe('EmptyTool');
    expect(result[0].description).toBe('EmptyTool');
  });
});
