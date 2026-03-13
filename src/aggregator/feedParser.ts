import Parser from 'rss-parser';
import { v4 as uuidv4 } from 'uuid';
import { Source, RawArticle } from '../types';

const parser = new Parser();

/**
 * Fetches and parses an RSS/Atom feed from the given source.
 * Skips items missing required fields (title, link) and logs warnings.
 * Throws on fetch/parse failure so the orchestrator can handle it.
 */
export async function parseFeed(source: Source): Promise<RawArticle[]> {
  let feed: Parser.Output<Record<string, unknown>>;
  try {
    feed = await parser.parseURL(source.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch/parse feed from "${source.name}" (${source.url}): ${message}`);
  }

  const articles: RawArticle[] = [];
  const now = new Date();

  for (const item of feed.items) {
    if (!item.title || !item.link) {
      console.warn(
        `[feedParser] Skipping item from "${source.name}": missing ${!item.title ? 'title' : 'url'}`
      );
      continue;
    }

    articles.push({
      id: uuidv4(),
      sourceId: source.id,
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : now,
      rawContent: item.content || item.contentSnippet || item['description'] as string || '',
      fetchedAt: now,
      isToolRadarCandidate: false,
    });
  }

  return articles;
}
