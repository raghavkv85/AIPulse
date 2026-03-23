import * as fs from 'fs';
import type {
  NewsletterConfig,
  CoverageCategory,
  ScheduleConfig,
  ArticleCaps,
  ContentFilterCriteria,
  ArchiveConfig,
  EmailConfig,
  LLMConfig,
  Source,
} from './types';

/**
 * Returns the full default configuration for the AI Newsletter system.
 */
export function getDefaultConfig(): NewsletterConfig {
  return {
    sources: getDefaultSources(),
    toolRadarSources: getDefaultToolRadarSources(),
    categories: getDefaultCategories(),
    contentFilter: getDefaultContentFilter(),
    articleCaps: getDefaultArticleCaps(),
    schedule: getDefaultSchedule(),
    email: getDefaultEmailConfig(),
    archive: getDefaultArchiveConfig(),
    llm: getDefaultLLMConfig(),
  };
}

/**
 * Loads a NewsletterConfig from a JSON file, merging with defaults.
 * User-provided values override defaults. If no path is given, returns defaults.
 */
export function loadConfig(configPath?: string): NewsletterConfig {
  const defaults = getDefaultConfig();

  if (!configPath) {
    return defaults;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const userConfig = JSON.parse(raw) as Partial<NewsletterConfig>;

  return mergeConfig(defaults, userConfig);
}

/**
 * Deep-merges user config into defaults. User values override defaults.
 * Arrays from user config replace default arrays entirely.
 */
function mergeConfig(
  defaults: NewsletterConfig,
  user: Partial<NewsletterConfig>
): NewsletterConfig {
  return {
    sources: user.sources ?? defaults.sources,
    toolRadarSources: user.toolRadarSources ?? defaults.toolRadarSources,
    categories: user.categories ?? defaults.categories,
    contentFilter: user.contentFilter
      ? {
          include: user.contentFilter.include ?? defaults.contentFilter.include,
          exclude: user.contentFilter.exclude ?? defaults.contentFilter.exclude,
        }
      : defaults.contentFilter,
    articleCaps: user.articleCaps
      ? { ...defaults.articleCaps, ...user.articleCaps }
      : defaults.articleCaps,
    schedule: user.schedule
      ? { ...defaults.schedule, ...user.schedule }
      : defaults.schedule,
    email: user.email
      ? { ...defaults.email, ...user.email }
      : defaults.email,
    archive: user.archive
      ? { ...defaults.archive, ...user.archive }
      : defaults.archive,
    llm: user.llm
      ? { ...defaults.llm, ...user.llm }
      : defaults.llm,
  };
}

// ---------------------------------------------------------------------------
// Default value helpers
// ---------------------------------------------------------------------------

function getDefaultCategories(): CoverageCategory[] {
  return [
    {
      id: 'anthropic-claude',
      name: 'Anthropic/Claude',
      keywords: ['anthropic', 'claude', 'sonnet', 'opus', 'haiku'],
      enabled: true,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      keywords: ['openai', 'gpt', 'chatgpt', 'dall-e', 'sora', 'o1', 'o3'],
      enabled: true,
    },
    {
      id: 'google',
      name: 'Google',
      keywords: ['google', 'gemini', 'deepmind', 'bard', 'vertex'],
      enabled: true,
    },
    {
      id: 'aws',
      name: 'AWS',
      keywords: ['aws', 'amazon', 'bedrock', 'sagemaker', 'titan'],
      enabled: true,
    },
    {
      id: 'builder-tools-oss',
      name: 'Builder Tools & Open Source',
      keywords: [
        'open source',
        'oss',
        'framework',
        'sdk',
        'library',
        'langchain',
        'llamaindex',
        'huggingface',
        'ollama',
        'vllm',
      ],
      enabled: true,
    },
  ];
}

function getDefaultSchedule(): ScheduleConfig {
  return {
    days: ['monday', 'friday'],
    time: '06:00',
    timezone: 'America/Chicago',
  };
}

function getDefaultArticleCaps(): ArticleCaps {
  return {
    perCategory: 3,
    toolRadarEntries: 4,
    totalMax: 18,
  };
}

function getDefaultContentFilter(): ContentFilterCriteria {
  return {
    include: [
      'API',
      'SDK',
      'model',
      'launch',
      'release',
      'developer',
      'tool',
      'framework',
      'infrastructure',
      'open-source',
      'open source',
      'benchmark',
      'pricing',
      'agent',
      'LLM',
      'GPT',
      'Claude',
      'Gemini',
      'Bedrock',
      'AI',
      'machine learning',
      'neural',
      'training',
      'inference',
      'fine-tune',
      'RAG',
      'vector',
      'embedding',
      'context window',
      'token',
    ],
    exclude: [
      'political drama',
      'regulatory news',
      'corporate drama',
      'funding rounds without technical substance',
      'general consumer features',
      'legislation',
      'lawsuit',
      'litigation',
      'court ruling',
      'legal battle',
      'copyright dispute',
      'regulation',
      'compliance',
      'policy',
      'antitrust',
      'congressional',
      'senate',
      'executive order',
      'government ban',
      'trade war',
      'tariff',
      'sanctions',
      'geopolitical',
      'territorial',
      'border',
      'national security review',
      'lobbying',
      'privacy law',
      'GDPR',
      'AI act',
      'AI safety regulation',
      'ethics board',
      'bias controversy',
      'employee lawsuit',
      'labor dispute',
      'union',
      'stock price',
      'IPO',
      'market cap',
      'earnings report',
      'acquisition rumor',
    ],
  };
}

function getDefaultArchiveConfig(): ArchiveConfig {
  return {
    type: 'file',
    basePath: './archive',
    retentionMonths: 12,
  };
}

function getDefaultEmailConfig(): EmailConfig {
  return {
    provider: 'resend',
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: 'AI Pulse <onboarding@resend.dev>',
  };
}

function getDefaultLLMConfig(): LLMConfig {
  return {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKeyEnvVar: 'LLM_API_KEY',
  };
}


function getDefaultSources(): Source[] {
  return [
    // Anthropic / Claude
    { id: 'anthropic-blog', name: 'Anthropic Blog', url: 'https://www.anthropic.com/news', type: 'scrape', categories: ['anthropic-claude'], enabled: true },

    // OpenAI
    { id: 'openai-blog', name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: 'rss', categories: ['openai'], enabled: true },

    // Google AI
    { id: 'google-ai-blog', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', type: 'rss', categories: ['google'], enabled: true },
    { id: 'deepmind-blog', name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', type: 'rss', categories: ['google'], enabled: true },

    // AWS
    { id: 'aws-ml-blog', name: 'AWS ML Blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', type: 'rss', categories: ['aws'], enabled: true },
    { id: 'aws-news', name: 'AWS News', url: 'https://aws.amazon.com/blogs/aws/feed/', type: 'rss', categories: ['aws'], enabled: true },

    // Builder Tools & Open Source
    { id: 'huggingface-blog', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', type: 'rss', categories: ['builder-tools-oss'], enabled: true },
    { id: 'the-verge-ai', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', type: 'rss', categories: ['builder-tools-oss'], enabled: true },
    { id: 'techcrunch-ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', type: 'rss', categories: ['builder-tools-oss'], enabled: true },
    { id: 'ars-ai', name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', type: 'rss', categories: ['builder-tools-oss'], enabled: true },
  ];
}

function getDefaultToolRadarSources(): Source[] {
  return [
    { id: 'hn-tools', name: 'Hacker News', url: 'https://news.ycombinator.com', type: 'tool-radar', categories: ['builder-tools-oss'], enabled: true },
  ];
}

/** Default subscriber email */
export const DEFAULT_SUBSCRIBER_EMAIL = 'raghavakumar85@gmail.com';
