import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { Source, RawArticle } from '../types';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const HN_TOP_STORIES_LIMIT = 30;

/**
 * Determines whether a source URL points to the Hacker News API or website.
 */
function isHackerNewsSource(url: string): boolean {
  return (
    url.includes('hacker-news.firebaseio.com') ||
    url.includes('news.ycombinator.com')
  );
}

/**
 * Fetches top stories from the Hacker News API and returns them as RawArticles.
 */
async function fetchHackerNews(source: Source): Promise<RawArticle[]> {
  const apiUrl = `${HN_API_BASE}/topstories.json`;
  let storyIds: number[];

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    storyIds = await response.json() as number[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch Hacker News top stories for "${source.name}": ${message}`);
  }

  const topIds = storyIds.slice(0, HN_TOP_STORIES_LIMIT);
  const now = new Date();
  const articles: RawArticle[] = [];

  const storyPromises = topIds.map(async (id) => {
    try {
      const res = await fetch(`${HN_API_BASE}/item/${id}.json`);
      if (!res.ok) return null;
      return await res.json() as {
        title?: string;
        url?: string;
        time?: number;
        text?: string;
      };
    } catch {
      return null;
    }
  });

  const stories = await Promise.all(storyPromises);

  for (const story of stories) {
    if (!story || !story.title || !story.url) continue;

    articles.push({
      id: uuidv4(),
      sourceId: source.id,
      title: story.title,
      url: story.url,
      publishedAt: story.time ? new Date(story.time * 1000) : now,
      rawContent: story.text || '',
      fetchedAt: now,
      isToolRadarCandidate: true,
    });
  }

  return articles;
}

/**
 * Scrapes a generic tool-radar source (Product Hunt, GitHub trending, indie hacker sites)
 * using cheerio, similar to the standard scraper but marks all results as tool-radar candidates.
 */
async function scrapeToolRadarPage(source: Source): Promise<RawArticle[]> {
  let html: string;
  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch tool-radar page from "${source.name}" (${source.url}): ${message}`);
  }

  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const now = new Date();
  const seenUrls = new Set<string>();

  const selectors = [
    'article',
    'h2 a[href]',
    'h3 a[href]',
    '.post a[href]',
    '.entry a[href]',
  ];

  for (const selector of selectors) {
    $(selector).each((_i, el) => {
      const $el = $(el);
      let title: string | undefined;
      let url: string | undefined;
      let publishedAt: Date = now;
      let rawContent = '';

      if (selector === 'article') {
        const $heading = $el.find('h1 a, h2 a, h3 a').first();
        title = $heading.text().trim() || $el.find('h1, h2, h3').first().text().trim();
        url = $heading.attr('href');

        const $time = $el.find('time');
        const datetime = $time.attr('datetime') || $time.text().trim();
        if (datetime) {
          const parsed = new Date(datetime);
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed;
          }
        }

        rawContent = $el.find('p').first().text().trim();
      } else {
        title = $el.text().trim();
        url = $el.attr('href');

        const $parent = $el.closest('article, .post, .entry, li, div');
        const $time = $parent.find('time');
        const datetime = $time.attr('datetime') || $time.text().trim();
        if (datetime) {
          const parsed = new Date(datetime);
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed;
          }
        }

        rawContent = $parent.find('p').first().text().trim();
      }

      if (!title || !url) return;

      try {
        url = new URL(url, source.url).href;
      } catch {
        return;
      }

      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      if (!rawContent) {
        rawContent = $('meta[name="description"]').attr('content') || '';
      }

      articles.push({
        id: uuidv4(),
        sourceId: source.id,
        title,
        url,
        publishedAt,
        rawContent,
        fetchedAt: now,
        isToolRadarCandidate: true,
      });
    });
  }

  return articles;
}

/**
 * Fetches tool-radar candidates from a source.
 * Dispatches to the Hacker News API fetcher or the generic HTML scraper
 * depending on the source URL. All returned articles are marked with
 * `isToolRadarCandidate: true`.
 */
export async function fetchToolRadarCandidates(source: Source): Promise<RawArticle[]> {
  if (isHackerNewsSource(source.url)) {
    return fetchHackerNews(source);
  }
  return scrapeToolRadarPage(source);
}
