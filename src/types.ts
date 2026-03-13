// AI Newsletter System - Core TypeScript Interfaces and Types

// ============================================================================
// Content Aggregator Types
// ============================================================================

export interface Source {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'atom' | 'scrape' | 'tool-radar';
  categories: string[];
  enabled: boolean;
}

export interface RawArticle {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: Date;
  rawContent: string;
  fetchedAt: Date;
  isToolRadarCandidate: boolean;
}

export interface AggregationResult {
  articlesCollected: number;
  sourcesFailed: SourceFailure[];
  sourcesSucceeded: string[];
}

export interface SourceFailure {
  sourceId: string;
  error: string;
  timestamp: Date;
}

export interface ContentAggregator {
  aggregate(): Promise<AggregationResult>;
  addSource(source: Source): void;
  removeSource(sourceId: string): void;
  getSources(): Source[];
}

// ============================================================================
// Content Curator Types
// ============================================================================

export interface ContentFilterCriteria {
  include: string[];
  exclude: string[];
}

export interface CuratedArticle {
  id: string;
  rawArticleId: string;
  title: string;
  url: string;
  publishedAt: Date;
  summary: string;
  whyItMatters: string;
  useCases: string[];
  category: string;
  relevanceScore: number;
  dedupeGroupId: string;
}

export interface ToolRadarEntry {
  id: string;
  rawArticleId: string;
  name: string;
  oneLiner: string;
  description: string;
  bestFor: string;
  url: string;
}

export interface CurationResult {
  articles: CuratedArticle[];
  toolRadar: ToolRadarEntry[];
  totalRawArticles: number;
  duplicatesRemoved: number;
  filteredOut: number;
  articlesCapped: number;
}

export interface ContentCurator {
  curate(rawArticles: RawArticle[], categories: string[], filterCriteria: ContentFilterCriteria): Promise<CurationResult>;
  filterContent(articles: RawArticle[], criteria: ContentFilterCriteria): Promise<RawArticle[]>;
  deduplicate(articles: RawArticle[]): Promise<RawArticle[]>;
  rankArticles(articles: RawArticle[], category: string): Promise<RawArticle[]>;
  generateArticleTreatment(article: RawArticle): Promise<{ summary: string; whyItMatters: string; useCases: string[] }>;
  selectToolRadar(candidates: RawArticle[]): Promise<ToolRadarEntry[]>;
}

// ============================================================================
// Delivery Engine Types
// ============================================================================

export interface Digest {
  id: string;
  publishedAt: Date;
  editorialIntro: string;
  sections: DigestSection[];
  toolRadar: ToolRadarEntry[];
  totalArticleCount: number;
  categoryCount: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface DigestSection {
  category: string;
  articles: CuratedArticle[];
}

export interface DeliveryResult {
  digestId: string;
  subscribersSent: number;
  subscribersFailed: SubscriberFailure[];
  archivedUrl: string;
}

export interface SubscriberFailure {
  subscriberId: string;
  email: string;
  error: string;
}

export interface DeliveryEngine {
  generateDigest(curationResult: CurationResult, periodStart: Date): Promise<Digest>;
  renderHtml(digest: Digest): string;
  renderPlainText(digest: Digest): string;
  send(digest: Digest, subscribers: Subscriber[]): Promise<DeliveryResult>;
  archive(digest: Digest): Promise<string>;
}

// ============================================================================
// Subscriber Manager Types
// ============================================================================

export interface Subscriber {
  id: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
  subscribedAt: Date;
  unsubscribedAt?: Date;
  consecutiveBounces: number;
}

export interface SubscriberManager {
  subscribe(email: string): Promise<Subscriber>;
  unsubscribe(subscriberId: string): Promise<void>;
  confirmSubscription(subscriberId: string): Promise<void>;
  recordBounce(subscriberId: string): Promise<void>;
  getActiveSubscribers(): Promise<Subscriber[]>;
  generateUnsubscribeLink(subscriberId: string): string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface NewsletterConfig {
  sources: Source[];
  categories: CoverageCategory[];
  toolRadarSources: Source[];
  contentFilter: ContentFilterCriteria;
  articleCaps: ArticleCaps;
  schedule: ScheduleConfig;
  email: EmailConfig;
  archive: ArchiveConfig;
  llm: LLMConfig;
}

export interface ArticleCaps {
  perCategory: number;
  toolRadarEntries: number;
  totalMax: number;
}

export interface CoverageCategory {
  id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
}

export interface ScheduleConfig {
  days: ('monday' | 'friday')[];
  time: string;          // HH:MM format, default "06:00"
  timezone: string;      // IANA timezone, default "America/Chicago" (CST)
}

export interface EmailConfig {
  provider: 'resend';
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface ArchiveConfig {
  type: 'file' | 's3';
  basePath: string;
  retentionMonths: number;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'groq';
  model: string;
  apiKeyEnvVar: string;
}
