import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchToolRadarCandidates } from '../../../src/aggregator/toolRadarFetcher';
import { Source } from '../../../src/types';

const makeSource = (overrides?: Partial<Source>): Source => ({
  id: 'tr-1',
  name: 'Test Tool Radar',
  url: 'https://producthunt.com/topics/developer-tools',
  type: 'tool-radar',
  categories: ['tools'],
  enabled: true,
  ...overrides,
});

const makeHNSource = (overrides?: Partial<Source>): Source =>
  makeSource({
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    ...overrides,
  });

describe('fetchToolRadarCandidates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks all scraped articles as tool-radar candidates', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="/tool/1">Cool Tool</a></h2>
          <p>A great developer tool.</p>
        </article>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await fetchToolRadarCandidates(makeSource());
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) {
      expect(a.isToolRadarCandidate).toBe(true);
    }
  });

  it('returns RawArticle[] with correct fields from scraped page', async () => {
    const html = `
      <html><body>
        <article>
          <h2><a href="https://example.com/tool">My Tool</a></h2>
          <time datetime="2024-07-01T12:00:00Z">July 1</time>
          <p>Tool description here.</p>
        </article>
      </body></html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await fetchToolRadarCandidates(makeSource());
    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe('My Tool');
    expect(articles[0].url).toBe('https://example.com/tool');
    expect(articles[0].rawContent).toBe('Tool description here.');
    expect(articles[0].publishedAt).toEqual(new Date('2024-07-01T12:00:00Z'));
    expect(articles[0].sourceId).toBe('tr-1');
    expect(articles[0].isToolRadarCandidate).toBe(true);
  });

  it('uses Hacker News API for HN sources', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // First call: top stories
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([101, 102]), { status: 200 })
    );
    // Story 101
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({
        title: 'HN Tool',
        url: 'https://hntool.dev',
        time: 1719835200,
        text: 'A tool from HN',
      }), { status: 200 })
    );
    // Story 102 — no URL, should be skipped
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({
        title: 'Ask HN: Something',
        time: 1719835200,
        text: 'Discussion post',
      }), { status: 200 })
    );

    const articles = await fetchToolRadarCandidates(makeHNSource());
    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe('HN Tool');
    expect(articles[0].url).toBe('https://hntool.dev');
    expect(articles[0].isToolRadarCandidate).toBe(true);
    expect(articles[0].rawContent).toBe('A tool from HN');
  });

  it('uses HN API for firebaseio.com URLs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([200]), { status: 200 })
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({
        title: 'Firebase HN Tool',
        url: 'https://tool.io',
        time: 1719835200,
      }), { status: 200 })
    );

    const source = makeSource({
      url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    });
    const articles = await fetchToolRadarCandidates(source);
    expect(articles.length).toBe(1);
    expect(articles[0].isToolRadarCandidate).toBe(true);
  });

  it('throws descriptive error on scrape fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    await expect(fetchToolRadarCandidates(makeSource())).rejects.toThrow(
      /Failed to fetch tool-radar page from "Test Tool Radar".*Connection refused/
    );
  });

  it('throws descriptive error on HN API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));

    await expect(fetchToolRadarCandidates(makeHNSource())).rejects.toThrow(
      /Failed to fetch Hacker News top stories.*Timeout/
    );
  });

  it('throws on non-OK HTTP response for scrape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(fetchToolRadarCandidates(makeSource())).rejects.toThrow(/HTTP 500/);
  });

  it('returns empty array for page with no recognizable articles', async () => {
    const html = `<html><body><p>Nothing here.</p></body></html>`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, { status: 200 })
    );

    const articles = await fetchToolRadarCandidates(makeSource());
    expect(articles).toEqual([]);
  });

  it('skips HN stories that fail to fetch individually', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([301, 302]), { status: 200 })
    );
    // Story 301 fails
    fetchSpy.mockRejectedValueOnce(new Error('item fetch failed'));
    // Story 302 succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({
        title: 'Surviving Tool',
        url: 'https://surviving.dev',
        time: 1719835200,
      }), { status: 200 })
    );

    const articles = await fetchToolRadarCandidates(makeHNSource());
    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe('Surviving Tool');
  });
});
