import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../src/types';

// Mock rss-parser before importing feedParser
vi.mock('rss-parser', () => {
  const MockParser = vi.fn();
  MockParser.prototype.parseURL = vi.fn();
  return { default: MockParser };
});

import Parser from 'rss-parser';
import { parseFeed } from '../../../src/aggregator/feedParser';

const mockParseURL = Parser.prototype.parseURL as ReturnType<typeof vi.fn>;

const testSource: Source = {
  id: 'src-1',
  name: 'Test Blog',
  url: 'https://example.com/feed.xml',
  type: 'rss',
  categories: ['openai'],
  enabled: true,
};

describe('parseFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid RSS feed into RawArticle[]', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'GPT-5 Released',
          link: 'https://example.com/gpt5',
          pubDate: '2025-01-15T10:00:00Z',
          content: 'Full article content here.',
        },
      ],
    });

    const articles = await parseFeed(testSource);

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      sourceId: 'src-1',
      title: 'GPT-5 Released',
      url: 'https://example.com/gpt5',
      rawContent: 'Full article content here.',
      isToolRadarCandidate: false,
    });
    expect(articles[0].id).toBeTruthy();
    expect(articles[0].publishedAt).toEqual(new Date('2025-01-15T10:00:00Z'));
    expect(articles[0].fetchedAt).toBeInstanceOf(Date);
  });

  it('skips items missing title and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockParseURL.mockResolvedValue({
      items: [
        { link: 'https://example.com/no-title', content: 'some content' },
        { title: 'Valid Article', link: 'https://example.com/valid', content: 'ok' },
      ],
    });

    const articles = await parseFeed(testSource);

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Valid Article');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing title')
    );
    warnSpy.mockRestore();
  });

  it('skips items missing link and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockParseURL.mockResolvedValue({
      items: [
        { title: 'No Link Article' },
      ],
    });

    const articles = await parseFeed(testSource);

    expect(articles).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing url')
    );
    warnSpy.mockRestore();
  });

  it('falls back to contentSnippet or description for rawContent', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        { title: 'Snippet Article', link: 'https://example.com/1', contentSnippet: 'snippet text' },
        { title: 'Desc Article', link: 'https://example.com/2', description: 'desc text' },
        { title: 'Empty Article', link: 'https://example.com/3' },
      ],
    });

    const articles = await parseFeed(testSource);

    expect(articles).toHaveLength(3);
    expect(articles[0].rawContent).toBe('snippet text');
    expect(articles[1].rawContent).toBe('desc text');
    expect(articles[2].rawContent).toBe('');
  });

  it('uses current date when pubDate is missing', async () => {
    const before = new Date();
    mockParseURL.mockResolvedValue({
      items: [
        { title: 'No Date', link: 'https://example.com/nodate', content: 'text' },
      ],
    });

    const articles = await parseFeed(testSource);
    const after = new Date();

    expect(articles[0].publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(articles[0].publishedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('throws a descriptive error when feed fetch fails', async () => {
    mockParseURL.mockRejectedValue(new Error('Network timeout'));

    await expect(parseFeed(testSource)).rejects.toThrow(
      'Failed to fetch/parse feed from "Test Blog" (https://example.com/feed.xml): Network timeout'
    );
  });

  it('handles an empty feed gracefully', async () => {
    mockParseURL.mockResolvedValue({ items: [] });

    const articles = await parseFeed(testSource);
    expect(articles).toHaveLength(0);
  });
});
