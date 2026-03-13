import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapePage } from '../../../src/aggregator/scraper';
import { Source } from '../../../src/types';

const makeSource = (overrides?: Partial<Source>): Source => ({
  id: 'src-1',
  name: 'Test Blog',
  url: 'https://example.com/blog',
  type: 'scrape',
  categories: ['ai'],
  enabled: true,
  ...overrides,
});

describe('scrapePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts articles from <article> elements with heading links', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="/post/1">First Post</a></h2>
          <time datetime="2024-06-01T10:00:00Z">June 1</time>
          <p>This is the first post content.</p>
        </article>
        <article>
          <h3><a href="/post/2">Second Post</a></h3>
          <p>Second post content here.</p>
        </article>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());

    expect(articles.length).toBe(2);
    expect(articles[0].title).toBe('First Post');
    expect(articles[0].url).toBe('https://example.com/post/1');
    expect(articles[0].rawContent).toBe('This is the first post content.');
    expect(articles[0].publishedAt).toEqual(new Date('2024-06-01T10:00:00Z'));
    expect(articles[0].isToolRadarCandidate).toBe(false);
    expect(articles[0].sourceId).toBe('src-1');

    expect(articles[1].title).toBe('Second Post');
    expect(articles[1].url).toBe('https://example.com/post/2');
  });

  it('extracts articles from h2/h3 links outside article tags', async () => {
    const html = `
      <html><body>
        <div class="post">
          <h2><a href="https://example.com/a">Headline A</a></h2>
          <p>Some description.</p>
        </div>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    expect(articles.some(a => a.title === 'Headline A')).toBe(true);
  });

  it('skips items missing title or url', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="">No Title Link</a></h2>
        </article>
        <article>
          <h2>Title Without Link</h2>
        </article>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    // "No Title Link" has text but empty href → gets resolved to base URL, so it may or may not appear
    // "Title Without Link" has no <a> inside, so no url → skipped
    for (const a of articles) {
      expect(a.title).toBeTruthy();
      expect(a.url).toBeTruthy();
    }
  });

  it('deduplicates articles with the same URL', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="/same">Duplicate One</a></h2>
          <p>Content one.</p>
        </article>
        <h2><a href="/same">Duplicate Two</a></h2>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    const sameUrlArticles = articles.filter(a => a.url === 'https://example.com/same');
    expect(sameUrlArticles.length).toBe(1);
  });

  it('throws a descriptive error on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(scrapePage(makeSource())).rejects.toThrow(
      /Failed to fetch page from "Test Blog".*Network error/
    );
  });

  it('throws on non-OK HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' })
    );

    await expect(scrapePage(makeSource())).rejects.toThrow(/HTTP 404/);
  });

  it('resolves relative URLs against the source URL', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="/relative/path">Relative Link</a></h2>
          <p>Content.</p>
        </article>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    expect(articles[0].url).toBe('https://example.com/relative/path');
  });

  it('returns empty array for page with no recognizable articles', async () => {
    const html = `<html><body><p>Just a paragraph, no articles.</p></body></html>`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    expect(articles).toEqual([]);
  });

  it('falls back to meta description when no paragraph content found', async () => {
    const html = `
      <html>
        <head><meta name="description" content="Meta description fallback"></head>
        <body>
          <article>
            <h2><a href="/post">No Paragraph Post</a></h2>
          </article>
        </body>
      </html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await scrapePage(makeSource());
    const post = articles.find(a => a.title === 'No Paragraph Post');
    expect(post?.rawContent).toBe('Meta description fallback');
  });
});
