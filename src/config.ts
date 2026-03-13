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
    sources: [],
    toolRadarSources: [],
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
      'API features',
      'SDK releases',
      'model launches',
      'developer tools',
      'frameworks',
      'infrastructure updates',
      'open-source model releases',
      'benchmarks',
      'pricing changes',
    ],
    exclude: [
      'political drama',
      'regulatory news without build impact',
      'corporate drama',
      'funding rounds without technical substance',
      'general consumer features',
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
    from: 'newsletter@example.com',
  };
}

function getDefaultLLMConfig(): LLMConfig {
  return {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKeyEnvVar: 'LLM_API_KEY',
  };
}
