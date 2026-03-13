import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { Source, RawArticle } from '../types';

/**
 * Scrapes a web page for article links and metadata.
 * Uses cheerio to parse HTML and extract articles from common patterns
 * (article tags, h2/h3 links, etc.).
 * Throws on fetch failure so the orchestrator can handle it.
 */
export async function scrapePage(source: Source): Promise<RawArticle[]> {
  let html: string;
  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch page from "${source.name}" (${source.url}): ${message}`);
  }

  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];
  const now = new Date();
  const seenUrls = new Set<string>();

  // Look for article-like elements: <article>, or headings (h2/h3) containing links
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
        // For <article> elements, look for heading links inside
        const $heading = $el.find('h1 a, h2 a, h3 a').first();
        title = $heading.text().trim() || $el.find('h1, h2, h3').first().text().trim();
        url = $heading.attr('href');

        // Try to find a date
        const $time = $el.find('time');
        const datetime = $time.attr('datetime') || $time.text().trim();
        if (datetime) {
          const parsed = new Date(datetime);
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed;
          }
        }

        // Extract content from paragraph or meta description
        rawContent = $el.find('p').first().text().trim();
      } else {
        // For heading links (h2 a, h3 a, etc.)
        title = $el.text().trim();
        url = $el.attr('href');

        // Look for sibling/parent time element
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

      // Skip items missing required fields
      if (!title || !url) {
        return;
      }

      // Resolve relative URLs
      try {
        url = new URL(url, source.url).href;
      } catch {
        return; // Skip invalid URLs
      }

      // Deduplicate within this scrape
      if (seenUrls.has(url)) {
        return;
      }
      seenUrls.add(url);

      // Fall back to meta description if no paragraph content found
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
        isToolRadarCandidate: false,
      });
    });
  }

  return articles;
}
