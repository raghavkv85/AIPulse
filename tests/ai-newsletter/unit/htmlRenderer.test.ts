import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../../src/delivery/htmlRenderer';
import { Digest, CuratedArticle, ToolRadarEntry, DigestSection } from '../../../src/types';

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

describe('renderHtml', () => {
  it('produces a complete HTML document', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the AI Pulse header with tagline', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('AI Pulse');
    expect(html).toContain('What shipped, why it matters, and what you can build with it');
  });

  it('includes the edition date', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    // The date format is locale-dependent but should contain "March" and "2026"
    expect(html).toContain('2026');
  });

  it('includes the stats bar with story count, category count, and date range', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('3 stories');
    expect(html).toContain('2 categories');
    expect(html).toContain('stats-bar');
  });

  it('includes the editorial introduction', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('Big week for builders');
    expect(html).toContain('editorial');
    expect(html).toContain("This Week's Pulse");
  });

  it('renders category sections with icons and titles', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('Anthropic / Claude');
    expect(html).toContain('OpenAI');
    expect(html).toContain('🟠'); // Anthropic icon
    expect(html).toContain('🟢'); // OpenAI icon
  });

  it('renders article cards with title as link', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('Claude Update');
    expect(html).toContain('GPT-5 Ships');
    expect(html).toContain('href="https://example.com/article"');
  });

  it('renders article summary', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('This is a test summary');
    expect(html).toContain('article-summary');
  });

  it('renders Why This Matters amber callout', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('why-matters');
    expect(html).toContain('Why This Matters');
    expect(html).toContain('This matters because it changes how you build products.');
  });

  it('renders What You Can Build green callout with bullet points', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('use-cases');
    expect(html).toContain('What You Can Build');
    expect(html).toContain('Build faster APIs');
    expect(html).toContain('Automate testing');
    expect(html).toContain('Ship to production');
  });

  it('renders article meta with date and source link', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('example.com');
    expect(html).toContain('article-meta');
  });

  it('renders Tool Radar section with compact cards', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('Tool Radar');
    expect(html).toContain('📡');
    expect(html).toContain('TestTool');
    expect(html).toContain('A tool for testing');
    expect(html).toContain('This tool helps you test things efficiently.');
    expect(html).toContain('Best for: Solo founders who need fast testing');
    expect(html).toContain('href="https://testtool.dev"');
  });

  it('renders footer with unsubscribe link', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe/123');
    expect(html).toContain('href="https://example.com/unsubscribe/123"');
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('View in browser');
    expect(html).toContain('Past editions');
  });

  it('omits Why This Matters when empty', () => {
    const digest = makeDigest({
      sections: [{
        category: 'OpenAI',
        articles: [makeArticle({ whyItMatters: '' })],
      }],
    });
    const html = renderHtml(digest, 'https://example.com/unsubscribe');
    expect(html).not.toContain('Why This Matters');
  });

  it('omits What You Can Build when useCases is empty', () => {
    const digest = makeDigest({
      sections: [{
        category: 'OpenAI',
        articles: [makeArticle({ useCases: [] })],
      }],
    });
    const html = renderHtml(digest, 'https://example.com/unsubscribe');
    expect(html).not.toContain('What You Can Build');
  });

  it('handles empty tool radar gracefully', () => {
    const digest = makeDigest({ toolRadar: [] });
    const html = renderHtml(digest, 'https://example.com/unsubscribe');
    expect(html).not.toContain('Tool Radar');
  });

  it('escapes HTML in user content', () => {
    const digest = makeDigest({
      editorialIntro: 'Test <script>alert("xss")</script> content',
    });
    const html = renderHtml(digest, 'https://example.com/unsubscribe');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes inline CSS styles (email-safe)', () => {
    const html = renderHtml(makeDigest(), 'https://example.com/unsubscribe');
    expect(html).toContain('<style>');
    expect(html).toContain('.wrapper');
    expect(html).toContain('.article-card');
    expect(html).toContain('.why-matters');
    expect(html).toContain('.use-cases');
    // No external stylesheets
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('uses correct category icons for known categories', () => {
    const digest = makeDigest({
      sections: [
        { category: 'Google', articles: [makeArticle({ category: 'Google' })] },
        { category: 'AWS', articles: [makeArticle({ category: 'AWS' })] },
        { category: 'Builder Tools & Open Source', articles: [makeArticle({ category: 'Builder Tools & Open Source' })] },
      ],
    });
    const html = renderHtml(digest, 'https://example.com/unsubscribe');
    expect(html).toContain('🔵'); // Google
    expect(html).toContain('🟡'); // AWS
    expect(html).toContain('🔮'); // Builder Tools
  });
});
