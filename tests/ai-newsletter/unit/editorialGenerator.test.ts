import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEditorialIntro } from '../../../src/delivery/editorialGenerator';
import { CuratedArticle, ToolRadarEntry, LLMConfig } from '../../../src/types';

// Mock the LLM client
vi.mock('../../../src/curator/llmClient', () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from '../../../src/curator/llmClient';
const mockCallLLM = vi.mocked(callLLM);

const llmConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'LLM_API_KEY',
};

function makeArticle(overrides: Partial<CuratedArticle> = {}): CuratedArticle {
  return {
    id: 'art-1',
    rawArticleId: 'raw-1',
    title: 'GPT-5 API Released',
    url: 'https://example.com/gpt5',
    publishedAt: new Date('2025-01-10'),
    summary: 'OpenAI released GPT-5 API.',
    whyItMatters: 'Faster inference for builders.',
    useCases: ['Build chatbots', 'Automate workflows'],
    category: 'OpenAI',
    relevanceScore: 0.9,
    dedupeGroupId: 'group-1',
    ...overrides,
  };
}

function makeToolEntry(overrides: Partial<ToolRadarEntry> = {}): ToolRadarEntry {
  return {
    id: 'tool-1',
    rawArticleId: 'raw-t1',
    name: 'CoolTool',
    oneLiner: 'A cool dev tool',
    description: 'Makes building easier.',
    bestFor: 'Solo founders',
    url: 'https://cooltool.dev',
    ...overrides,
  };
}

describe('generateEditorialIntro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns LLM-generated intro when LLM succeeds', async () => {
    mockCallLLM.mockResolvedValue('Big week for builders. Here is what matters.');

    const result = await generateEditorialIntro(
      [makeArticle()],
      [makeToolEntry()],
      llmConfig
    );

    expect(result).toBe('Big week for builders. Here is what matters.');
    expect(mockCallLLM).toHaveBeenCalledOnce();
  });

  it('falls back to static intro when LLM throws', async () => {
    mockCallLLM.mockRejectedValue(new Error('API key not found'));

    const result = await generateEditorialIntro(
      [makeArticle(), makeArticle({ id: 'art-2', title: 'Claude 4 Launch', category: 'Anthropic' })],
      [],
      llmConfig
    );

    expect(result).toContain('2 stories');
    expect(result).toContain('2 categories');
    expect(mockCallLLM).toHaveBeenCalledOnce();
  });

  it('falls back when LLM returns empty string', async () => {
    mockCallLLM.mockResolvedValue('   ');

    const result = await generateEditorialIntro(
      [makeArticle()],
      [],
      llmConfig
    );

    expect(result).toContain('1 stories');
    expect(result).toContain('1 category');
  });

  it('returns simple fallback for empty articles and tool radar', async () => {
    const result = await generateEditorialIntro([], [], llmConfig);

    expect(result).toBe("Here's what shipped this week across the AI landscape.");
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('includes article titles and categories in the LLM prompt', async () => {
    mockCallLLM.mockResolvedValue('Great week.');

    await generateEditorialIntro(
      [
        makeArticle({ title: 'Alpha Release', category: 'OpenAI' }),
        makeArticle({ id: 'art-2', title: 'Beta Launch', category: 'Google' }),
      ],
      [makeToolEntry()],
      llmConfig
    );

    const prompt = mockCallLLM.mock.calls[0][1].messages[1].content;
    expect(prompt).toContain('Alpha Release');
    expect(prompt).toContain('Beta Launch');
    expect(prompt).toContain('OpenAI');
    expect(prompt).toContain('Google');
    expect(prompt).toContain('1 tools in the Tool Radar');
  });

  it('handles articles with no tool radar entries in prompt', async () => {
    mockCallLLM.mockResolvedValue('Solid week.');

    await generateEditorialIntro([makeArticle()], [], llmConfig);

    const prompt = mockCallLLM.mock.calls[0][1].messages[1].content;
    expect(prompt).not.toContain('Tool Radar');
  });
});
