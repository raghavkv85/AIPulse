import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliveryEngineImpl } from '../../../src/delivery/index';
import {
  CurationResult,
  CuratedArticle,
  ToolRadarEntry,
  Subscriber,
  EmailConfig,
  LLMConfig,
} from '../../../src/types';

// Mock the external dependencies
vi.mock('../../../src/delivery/htmlRenderer', () => ({
  renderHtml: vi.fn().mockReturnValue('<html>rendered</html>'),
}));

vi.mock('../../../src/delivery/plainTextRenderer', () => ({
  renderPlainText: vi.fn().mockReturnValue('plain text rendered'),
}));

vi.mock('../../../src/delivery/editorialGenerator', () => ({
  generateEditorialIntro: vi.fn().mockResolvedValue('This week in AI...'),
}));

vi.mock('../../../src/delivery/emailSender', () => ({
  sendToSubscribers: vi.fn().mockResolvedValue({ sent: 2, failed: [] }),
}));

function makeArticle(overrides: Partial<CuratedArticle> = {}): CuratedArticle {
  return {
    id: 'art-1',
    rawArticleId: 'raw-1',
    title: 'Test Article',
    url: 'https://example.com/article',
    publishedAt: new Date('2024-01-15'),
    summary: 'A test summary.',
    whyItMatters: 'It matters because...',
    useCases: ['Build X', 'Build Y', 'Build Z'],
    category: 'OpenAI',
    relevanceScore: 0.9,
    dedupeGroupId: 'group-1',
    ...overrides,
  };
}

function makeToolRadarEntry(overrides: Partial<ToolRadarEntry> = {}): ToolRadarEntry {
  return {
    id: 'tool-1',
    rawArticleId: 'raw-tool-1',
    name: 'CoolTool',
    oneLiner: 'A cool tool',
    description: 'Does cool things',
    bestFor: 'Solo founders',
    url: 'https://cooltool.dev',
    ...overrides,
  };
}

function makeCurationResult(overrides: Partial<CurationResult> = {}): CurationResult {
  return {
    articles: [makeArticle()],
    toolRadar: [makeToolRadarEntry()],
    totalRawArticles: 10,
    duplicatesRemoved: 2,
    filteredOut: 3,
    articlesCapped: 1,
    ...overrides,
  };
}

function makeMockRepos() {
  return {
    digestRepo: {
      create: vi.fn().mockImplementation((r) => r),
      getById: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
      getLatest: vi.fn().mockReturnValue(undefined),
      updateArchiveUrl: vi.fn(),
      delete: vi.fn(),
    },
    curatedArticleRepo: {
      create: vi.fn().mockImplementation((a) => a),
      getById: vi.fn(),
      getByDigestId: vi.fn().mockReturnValue([]),
      getByCategory: vi.fn().mockReturnValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      assignToDigest: vi.fn(),
    },
    toolRadarRepo: {
      create: vi.fn().mockImplementation((e) => e),
      getById: vi.fn(),
      getByDigestId: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
      assignToDigest: vi.fn(),
    },
    deliveryLogRepo: {
      create: vi.fn().mockImplementation((r) => ({ ...r, id: 'log-1' })),
      getById: vi.fn(),
      getByDigestId: vi.fn().mockReturnValue([]),
      getBySubscriberId: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
    },
  };
}

const emailConfig: EmailConfig = {
  provider: 'resend',
  apiKey: 'test-key',
  from: 'news@example.com',
};

const llmConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-3-haiku-20240307',
  apiKeyEnvVar: 'LLM_API_KEY',
};

describe('DeliveryEngineImpl', () => {
  let repos: ReturnType<typeof makeMockRepos>;
  let engine: DeliveryEngineImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    repos = makeMockRepos();
    engine = new DeliveryEngineImpl({
      digestRepo: repos.digestRepo as any,
      curatedArticleRepo: repos.curatedArticleRepo as any,
      toolRadarRepo: repos.toolRadarRepo as any,
      deliveryLogRepo: repos.deliveryLogRepo as any,
      emailConfig,
      llmConfig,
      unsubscribeBaseUrl: 'https://example.com/unsubscribe',
    });
  });

  describe('generateDigest', () => {
    it('should build a Digest from curation result with editorial intro', async () => {
      const curationResult = makeCurationResult();
      const periodStart = new Date('2024-01-10');

      const digest = await engine.generateDigest(curationResult, periodStart);

      expect(digest.id).toBeDefined();
      expect(digest.editorialIntro).toBe('This week in AI...');
      expect(digest.sections).toHaveLength(1);
      expect(digest.sections[0].category).toBe('OpenAI');
      expect(digest.sections[0].articles).toHaveLength(1);
      expect(digest.toolRadar).toHaveLength(1);
      expect(digest.totalArticleCount).toBe(2); // 1 article + 1 tool radar
      expect(digest.categoryCount).toBe(1);
      expect(digest.periodStart).toEqual(periodStart);
    });

    it('should group articles by category into sections', async () => {
      const curationResult = makeCurationResult({
        articles: [
          makeArticle({ id: 'a1', category: 'OpenAI' }),
          makeArticle({ id: 'a2', category: 'Google' }),
          makeArticle({ id: 'a3', category: 'OpenAI' }),
        ],
      });

      const digest = await engine.generateDigest(curationResult, new Date('2024-01-10'));

      expect(digest.sections).toHaveLength(2);
      const openaiSection = digest.sections.find(s => s.category === 'OpenAI');
      const googleSection = digest.sections.find(s => s.category === 'Google');
      expect(openaiSection?.articles).toHaveLength(2);
      expect(googleSection?.articles).toHaveLength(1);
      expect(digest.categoryCount).toBe(2);
    });
  });

  describe('renderHtml', () => {
    it('should delegate to htmlRenderer', async () => {
      const digest = await engine.generateDigest(makeCurationResult(), new Date());
      const html = engine.renderHtml(digest);
      expect(html).toBe('<html>rendered</html>');
    });
  });

  describe('renderPlainText', () => {
    it('should delegate to plainTextRenderer', async () => {
      const digest = await engine.generateDigest(makeCurationResult(), new Date());
      const text = engine.renderPlainText(digest);
      expect(text).toBe('plain text rendered');
    });
  });

  describe('send', () => {
    it('should render, send emails, store digest and articles in DB', async () => {
      const digest = await engine.generateDigest(makeCurationResult(), new Date('2024-01-10'));
      const subscribers: Subscriber[] = [
        { id: 's1', email: 'a@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 },
        { id: 's2', email: 'b@test.com', status: 'active', subscribedAt: new Date(), consecutiveBounces: 0 },
      ];

      const result = await engine.send(digest, subscribers);

      expect(result.digestId).toBe(digest.id);
      expect(result.subscribersSent).toBe(2);
      expect(result.subscribersFailed).toHaveLength(0);
      expect(result.archivedUrl).toContain(digest.id);

      // Digest stored in DB
      expect(repos.digestRepo.create).toHaveBeenCalledOnce();
      expect(repos.digestRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: digest.id }),
      );

      // Curated articles stored
      expect(repos.curatedArticleRepo.create).toHaveBeenCalledOnce();

      // Tool radar entries stored
      expect(repos.toolRadarRepo.create).toHaveBeenCalledOnce();
    });
  });

  describe('archive', () => {
    it('should return a placeholder archive URL', async () => {
      const digest = await engine.generateDigest(makeCurationResult(), new Date());
      const url = await engine.archive(digest);
      expect(url).toBe(`archive/${digest.id}.html`);
    });
  });
});
