/**
 * AI Newsletter System — Main Entry Point
 *
 * Initializes the database, loads configuration, instantiates all components,
 * wires the pipeline (aggregate → curate → deliver → archive), and starts
 * the scheduler on the configured cron cadence.
 */

import type Database from 'better-sqlite3';
import { loadConfig } from './config';
import { initDatabase } from './database';
import {
  SourceRepo,
  ArticleRepo,
  CuratedArticleRepo,
  ToolRadarRepo,
  DigestRepo,
  SubscriberRepo,
  DeliveryLogRepo,
} from './repositories';
import { ContentAggregatorImpl } from './aggregator';
import { ContentCuratorImpl } from './curator';
import { DeliveryEngineImpl } from './delivery';
import { SubscriberManagerImpl } from './subscriber';
import { NewsletterScheduler } from './scheduler';
import { DigestArchive } from './archive';
import { CategoryManager } from './config/categoryManager';

// ---------------------------------------------------------------------------
// 1. Load configuration
// ---------------------------------------------------------------------------
const configPath = process.argv[2] && !['run-pipeline', 'add-source', 'remove-source', 'list-sources', 'add-subscriber', 'remove-subscriber', 'list-subscribers', 'list-archive'].includes(process.argv[2])
  ? process.argv[2]
  : undefined;
const config = loadConfig(configPath);
console.log('[init] Configuration loaded', configPath ? `from ${configPath}` : '(defaults)');

// ---------------------------------------------------------------------------
// 2. Initialize database
// ---------------------------------------------------------------------------
const db: Database.Database = initDatabase();
console.log('[init] Database initialized');

// ---------------------------------------------------------------------------
// 3. Create repository instances
// ---------------------------------------------------------------------------
const sourceRepo = new SourceRepo(db);
const articleRepo = new ArticleRepo(db);
const curatedArticleRepo = new CuratedArticleRepo(db);
const toolRadarRepo = new ToolRadarRepo(db);
const digestRepo = new DigestRepo(db);
const subscriberRepo = new SubscriberRepo(db);
const deliveryLogRepo = new DeliveryLogRepo(db);
console.log('[init] Repositories created');

// ---------------------------------------------------------------------------
// 4. Create component instances
// ---------------------------------------------------------------------------
const aggregator = new ContentAggregatorImpl(sourceRepo, articleRepo);

const curator = new ContentCuratorImpl(
  config.llm,
  config.contentFilter,
  config.articleCaps,
  config.categories,
);

const deliveryEngine = new DeliveryEngineImpl({
  digestRepo,
  curatedArticleRepo,
  toolRadarRepo,
  deliveryLogRepo,
  emailConfig: config.email,
  llmConfig: config.llm,
  unsubscribeBaseUrl: 'https://newsletter.example.com/unsubscribe',
});

const subscriberManager = new SubscriberManagerImpl(
  subscriberRepo,
  config.email,
  'https://newsletter.example.com/unsubscribe',
);

const archive = new DigestArchive(config.archive, digestRepo);

const categoryManager = new CategoryManager(config.categories, configPath);

console.log('[init] Components instantiated');

// ---------------------------------------------------------------------------
// 5. Define the pipeline function
// ---------------------------------------------------------------------------
async function runPipeline(): Promise<void> {
  console.log('[pipeline] Starting newsletter pipeline...');

  // a. Aggregate content from all sources
  console.log('[pipeline] Aggregating content...');
  const aggregationResult = await aggregator.aggregate();
  console.log(
    `[pipeline] Aggregation complete: ${aggregationResult.articlesCollected} articles collected, ` +
    `${aggregationResult.sourcesSucceeded.length} sources succeeded, ` +
    `${aggregationResult.sourcesFailed.length} sources failed`,
  );

  // b. Determine the period start (last digest date or 7 days ago)
  const lastDigest = digestRepo.getLatest();
  const periodStart = lastDigest
    ? lastDigest.publishedAt
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // c. Get articles since last digest
  const rawArticles = articleRepo.getByDateRange(periodStart, new Date());
  console.log(`[pipeline] ${rawArticles.length} articles since last digest`);

  if (rawArticles.length === 0) {
    console.log('[pipeline] No new articles available — skipping this edition');
    return;
  }

  // d. Curate articles
  console.log('[pipeline] Curating content...');
  const enabledCategoryIds = categoryManager
    .getEnabledCategories()
    .map((c) => c.id);

  const curationResult = await curator.curate(
    rawArticles,
    enabledCategoryIds,
    config.contentFilter,
  );
  console.log(
    `[pipeline] Curation complete: ${curationResult.articles.length} articles, ` +
    `${curationResult.toolRadar.length} tool radar entries, ` +
    `${curationResult.duplicatesRemoved} duplicates removed, ` +
    `${curationResult.filteredOut} filtered out`,
  );

  if (curationResult.articles.length === 0 && curationResult.toolRadar.length === 0) {
    console.log('[pipeline] No articles after curation — skipping this edition');
    return;
  }

  // e. Generate digest
  console.log('[pipeline] Generating digest...');
  const digest = await deliveryEngine.generateDigest(curationResult, periodStart);

  // f. Get active subscribers
  const subscribers = await subscriberManager.getActiveSubscribers();
  console.log(`[pipeline] Sending to ${subscribers.length} active subscribers`);

  // g. Send digest
  const deliveryResult = await deliveryEngine.send(digest, subscribers);
  console.log(
    `[pipeline] Delivery complete: ${deliveryResult.subscribersSent} sent, ` +
    `${deliveryResult.subscribersFailed.length} failed`,
  );

  // h. Archive the digest
  const htmlContent = deliveryEngine.renderHtml(digest);
  const archiveUrl = await archive.archive(htmlContent, digest.id, digest.publishedAt);
  console.log(`[pipeline] Archived at ${archiveUrl}`);

  console.log('[pipeline] Pipeline complete');
}

// ---------------------------------------------------------------------------
// 6. Create the scheduler (only start if running directly, not via CLI)
// ---------------------------------------------------------------------------
const scheduler = new NewsletterScheduler(config.schedule, runPipeline);

// Only auto-start the scheduler when running index.ts directly (not imported by CLI)
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectRun) {
  scheduler.start();
  console.log('[init] Scheduler started');
}

// ---------------------------------------------------------------------------
// 7. Export key instances for CLI / external use
// ---------------------------------------------------------------------------
export {
  config,
  db,
  aggregator,
  curator,
  deliveryEngine,
  subscriberManager,
  archive,
  categoryManager,
  scheduler,
  runPipeline,
  sourceRepo,
  articleRepo,
  digestRepo,
  subscriberRepo,
};
