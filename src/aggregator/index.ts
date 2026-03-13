import { ContentAggregator, Source, RawArticle, AggregationResult, SourceFailure } from '../types';
import { SourceRepo } from '../repositories/sourceRepo';
import { ArticleRepo } from '../repositories/articleRepo';
import { parseFeed } from './feedParser';
import { scrapePage } from './scraper';
import { fetchToolRadarCandidates } from './toolRadarFetcher';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Delays execution for the given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines if an error is likely a rate-limit response (HTTP 429 or similar).
 */
function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('429') || message.toLowerCase().includes('rate limit');
}

/**
 * Fetches articles from a single source, dispatching to the appropriate fetcher
 * based on source.type. Implements exponential backoff for rate-limited sources.
 */
async function fetchFromSource(source: Source): Promise<RawArticle[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      switch (source.type) {
        case 'rss':
        case 'atom':
          return await parseFeed(source);
        case 'scrape':
          return await scrapePage(source);
        case 'tool-radar':
          return await fetchToolRadarCandidates(source);
        default:
          throw new Error(`Unknown source type: ${(source as Source).type}`);
      }
    } catch (err) {
      lastError = err;

      // Only retry on rate-limit errors, and only if we haven't exhausted retries
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[aggregator] Rate limited on "${source.name}", retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await delay(delayMs);
        continue;
      }

      // Non-rate-limit errors or retries exhausted — rethrow
      throw lastError;
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

export class ContentAggregatorImpl implements ContentAggregator {
  constructor(
    private sourceRepo: SourceRepo,
    private articleRepo: ArticleRepo
  ) {}

  async aggregate(): Promise<AggregationResult> {
    const sources = this.sourceRepo.getEnabled();
    const sourcesSucceeded: string[] = [];
    const sourcesFailed: SourceFailure[] = [];
    let articlesCollected = 0;

    for (const source of sources) {
      try {
        const articles = await fetchFromSource(source);

        // Store articles, skipping duplicates by URL
        for (const article of articles) {
          const existing = this.articleRepo.getByUrl(article.url);
          if (!existing) {
            this.articleRepo.create(article);
            articlesCollected++;
          }
        }

        sourcesSucceeded.push(source.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[aggregator] Failed to fetch from "${source.name}": ${message}`);
        sourcesFailed.push({
          sourceId: source.id,
          error: message,
          timestamp: new Date(),
        });
      }
    }

    return { articlesCollected, sourcesFailed, sourcesSucceeded };
  }

  addSource(source: Source): void {
    this.sourceRepo.create(source);
  }

  removeSource(sourceId: string): void {
    this.sourceRepo.delete(sourceId);
  }

  getSources(): Source[] {
    return this.sourceRepo.getAll();
  }
}
