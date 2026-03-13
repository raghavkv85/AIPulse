import { v4 as uuidv4 } from 'uuid';
import {
  DeliveryEngine,
  Digest,
  DigestSection,
  CurationResult,
  CuratedArticle,
  ToolRadarEntry,
  DeliveryResult,
  Subscriber,
  EmailConfig,
  LLMConfig,
} from '../types';
import { DigestRepo } from '../repositories/digestRepo';
import { CuratedArticleRepo } from '../repositories/curatedArticleRepo';
import { ToolRadarRepo } from '../repositories/toolRadarRepo';
import { DeliveryLogRepo } from '../repositories/deliveryLogRepo';
import { renderHtml } from './htmlRenderer';
import { renderPlainText } from './plainTextRenderer';
import { generateEditorialIntro } from './editorialGenerator';
import { sendToSubscribers } from './emailSender';

export interface DeliveryEngineDeps {
  digestRepo: DigestRepo;
  curatedArticleRepo: CuratedArticleRepo;
  toolRadarRepo: ToolRadarRepo;
  deliveryLogRepo: DeliveryLogRepo;
  emailConfig: EmailConfig;
  llmConfig: LLMConfig;
  unsubscribeBaseUrl: string;
}

export class DeliveryEngineImpl implements DeliveryEngine {
  private digestRepo: DigestRepo;
  private curatedArticleRepo: CuratedArticleRepo;
  private toolRadarRepo: ToolRadarRepo;
  private deliveryLogRepo: DeliveryLogRepo;
  private emailConfig: EmailConfig;
  private llmConfig: LLMConfig;
  private unsubscribeBaseUrl: string;

  constructor(deps: DeliveryEngineDeps) {
    this.digestRepo = deps.digestRepo;
    this.curatedArticleRepo = deps.curatedArticleRepo;
    this.toolRadarRepo = deps.toolRadarRepo;
    this.deliveryLogRepo = deps.deliveryLogRepo;
    this.emailConfig = deps.emailConfig;
    this.llmConfig = deps.llmConfig;
    this.unsubscribeBaseUrl = deps.unsubscribeBaseUrl;
  }

  async generateDigest(curationResult: CurationResult, periodStart: Date): Promise<Digest> {
    const now = new Date();

    // Generate editorial intro via LLM
    const editorialIntro = await generateEditorialIntro(
      curationResult.articles,
      curationResult.toolRadar,
      this.llmConfig,
    );

    // Group articles by category into sections
    const categoryMap = new Map<string, CuratedArticle[]>();
    for (const article of curationResult.articles) {
      const existing = categoryMap.get(article.category) ?? [];
      existing.push(article);
      categoryMap.set(article.category, existing);
    }

    const sections: DigestSection[] = [];
    for (const [category, articles] of categoryMap) {
      sections.push({ category, articles });
    }

    const totalArticleCount = curationResult.articles.length + curationResult.toolRadar.length;

    const digest: Digest = {
      id: uuidv4(),
      publishedAt: now,
      editorialIntro,
      sections,
      toolRadar: curationResult.toolRadar,
      totalArticleCount,
      categoryCount: sections.length,
      periodStart,
      periodEnd: now,
    };

    return digest;
  }

  renderHtml(digest: Digest): string {
    return renderHtml(digest, this.unsubscribeBaseUrl);
  }

  renderPlainText(digest: Digest): string {
    return renderPlainText(digest, this.unsubscribeBaseUrl);
  }

  async send(digest: Digest, subscribers: Subscriber[]): Promise<DeliveryResult> {
    // Render both formats
    const html = this.renderHtml(digest);
    const plainText = this.renderPlainText(digest);

    // Send emails
    const subject = `AI Pulse — ${digest.publishedAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`;

    const { sent, failed } = await sendToSubscribers({
      html,
      plainText,
      subject,
      subscribers,
      emailConfig: this.emailConfig,
      digestId: digest.id,
      deliveryLogRepo: this.deliveryLogRepo,
      unsubscribeBaseUrl: this.unsubscribeBaseUrl,
    });

    // Store digest in DB
    this.digestRepo.create({
      id: digest.id,
      publishedAt: digest.publishedAt,
      editorialIntro: digest.editorialIntro,
      totalArticleCount: digest.totalArticleCount,
      categoryCount: digest.categoryCount,
      periodStart: digest.periodStart,
      periodEnd: digest.periodEnd,
      htmlContent: html,
      plainTextContent: plainText,
      archiveUrl: null,
    });

    // Store curated articles in DB (skip FK failures gracefully)
    for (const section of digest.sections) {
      for (const article of section.articles) {
        try {
          this.curatedArticleRepo.create(article, digest.id);
        } catch (err) {
          console.warn(`[delivery] Failed to store curated article ${article.id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    // Store tool radar entries in DB (skip FK failures gracefully)
    for (const entry of digest.toolRadar) {
      try {
        this.toolRadarRepo.create(entry, digest.id);
      } catch (err) {
        console.warn(`[delivery] Failed to store tool radar entry ${entry.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Archive (placeholder)
    const archivedUrl = await this.archive(digest);

    return {
      digestId: digest.id,
      subscribersSent: sent,
      subscribersFailed: failed,
      archivedUrl,
    };
  }

  async archive(digest: Digest): Promise<string> {
    // Placeholder — actual archive implementation is in task 11
    return `archive/${digest.id}.html`;
  }
}
