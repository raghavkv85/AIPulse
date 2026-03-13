import { describe, it, expect } from 'vitest';
import { renderPlainText } from '../../../src/delivery/plainTextRenderer';
import { Digest, CuratedArticle, ToolRadarEntry } from '../../../src/types';

function makeArticle(overrides: Partial<CuratedArticle> = {}): CuratedArticle {
  return {
    id: 'art-1',
    rawArticleId: 'raw-1',
    title: 'Test Article Title',
    url: 'https://example.com/article',
    publishedAt: new Date('2026-03-10'),
    summary: 'This is a test summary. It has two sentences.',
    whyItMatters: 'This matters because it changes how you build products.',
    useCases: ['Build faster APIs', 'Automate testing', 'Ship to production'],
    category: 'OpenAI',
    relevanceScore: 0.9,
    dedupeGroupId: 'group-1',
    ...overrides,
  };
}

function makeToolRadarEntry(overrides: Partial<ToolRadarEntry> = {}): ToolRadarEntry {
  return {
    id: 'tool-1',
    rawArticleId: 'raw-tool-1',
    name: 'TestTool',
    oneLiner: 'A tool for testing',
    description: 'This tool helps you test things efficiently.',
    bestFor: 'Solo founders who need fast testing',
    url: 'https://testtool.dev',
    ...overrides,
  };
}

function makeDigest(overrides: Partial<Digest> = {}): Digest {
  return {
    id: 'digest-1',
    publishedAt: new Date('2026-03-10'),
    editorialIntro: 'Big week for builders. Lots of new tools and APIs shipped.',
    sections: [
      {
        category: 'Anthropic / Claude',
        articles: [makeArticle({ category: 'Anthropic / Claude', title: 'Claude Update' })],
      },
      {
        category: 'OpenAI',
        articles: [makeArticle({ category: 'OpenAI', title: 'GPT-5 Ships' })],
      },
    ],
    toolRadar: [makeToolRadarEntry()],
    totalArticleCount: 3,
    categoryCount: 2,
    periodStart: new Date('2026-03-03'),
    periodEnd: new Date('2026-03-10'),
    ...overrides,
  };
}

describe('renderPlainText', () => {
  it('includes the AI Pulse header and date', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('AI Pulse');
    expect(text).toContain('2026');
  });

  it('includes stats with story count, category count, and date range', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('3 stories');
    expect(text).toContain('2 categories');
  });

  it('includes the editorial introduction', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('Big week for builders');
  });

  it('renders category section headers in uppercase', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('ANTHROPIC / CLAUDE');
    expect(text).toContain('OPENAI');
  });

  it('renders article title, URL, and summary', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('Claude Update');
    expect(text).toContain('https://example.com/article');
    expect(text).toContain('This is a test summary');
  });

  it('renders Why This Matters section', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('Why This Matters:');
    expect(text).toContain('This matters because it changes how you build products.');
  });

  it('renders What You Can Build with bullet points', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('What You Can Build:');
    expect(text).toContain('  - Build faster APIs');
    expect(text).toContain('  - Automate testing');
    expect(text).toContain('  - Ship to production');
  });

  it('renders Tool Radar section', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('TOOL RADAR');
    expect(text).toContain('TestTool');
    expect(text).toContain('A tool for testing');
    expect(text).toContain('This tool helps you test things efficiently.');
    expect(text).toContain('Best for: Solo founders who need fast testing');
    expect(text).toContain('https://testtool.dev');
  });

  it('includes unsubscribe link in footer', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe/123');
    expect(text).toContain('Unsubscribe: https://example.com/unsubscribe/123');
  });

  it('uses clear section separators', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).toContain('===');
    expect(text).toContain('---');
  });

  it('omits Why This Matters when empty', () => {
    const digest = makeDigest({
      sections: [{
        category: 'OpenAI',
        articles: [makeArticle({ whyItMatters: '' })],
      }],
    });
    const text = renderPlainText(digest, 'https://example.com/unsubscribe');
    expect(text).not.toContain('Why This Matters:');
  });

  it('omits What You Can Build when useCases is empty', () => {
    const digest = makeDigest({
      sections: [{
        category: 'OpenAI',
        articles: [makeArticle({ useCases: [] })],
      }],
    });
    const text = renderPlainText(digest, 'https://example.com/unsubscribe');
    expect(text).not.toContain('What You Can Build:');
  });

  it('handles empty tool radar gracefully', () => {
    const digest = makeDigest({ toolRadar: [] });
    const text = renderPlainText(digest, 'https://example.com/unsubscribe');
    expect(text).not.toContain('TOOL RADAR');
  });

  it('produces readable plain text without HTML tags', () => {
    const text = renderPlainText(makeDigest(), 'https://example.com/unsubscribe');
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
  });
});
