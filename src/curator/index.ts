// ContentCurator orchestrator
// Pipeline: filter → deduplicate → rank → generate treatments → select tool radar

import { v4 as uuidv4 } from 'uuid';
import type {
  ContentCurator,
  RawArticle,
  CuratedArticle,
  ToolRadarEntry,
  CurationResult,
  ContentFilterCriteria,
  ArticleCaps,
  CoverageCategory,
  LLMConfig,
} from '../types';
import { filterContent } from './contentFilter';
import { deduplicate } from './deduplicator';
import { rankArticles, RankedArticle } from './ranker';
import { generateArticleTreatment } from './treatmentGenerator';
import { selectToolRadar } from './toolRadarSelector';
import { callLLM } from './llmClient';

export class ContentCuratorImpl implements ContentCurator {
  private llmConfig: LLMConfig;
  private filterCriteria: ContentFilterCriteria;
  private articleCaps: ArticleCaps;
  private coverageCategories: CoverageCategory[];

  constructor(
    llmConfig: LLMConfig,
    filterCriteria: ContentFilterCriteria,
    articleCaps: ArticleCaps,
    coverageCategories: CoverageCategory[]
  ) {
    this.llmConfig = llmConfig;
    this.filterCriteria = filterCriteria;
    this.articleCaps = articleCaps;
    this.coverageCategories = coverageCategories;
  }

  async curate(
    rawArticles: RawArticle[],
    categories: string[],
    filterCriteria: ContentFilterCriteria
  ): Promise<CurationResult> {
    const totalRawArticles = rawArticles.length;

    // Step a: Separate tool-radar candidates from regular articles
    const toolRadarCandidates = rawArticles.filter(a => a.isToolRadarCandidate);
    const regularArticles = rawArticles.filter(a => !a.isToolRadarCandidate);

    // Step b: Filter regular articles
    const filtered = await this.filterContent(regularArticles, filterCriteria);
    const filteredOut = regularArticles.length - filtered.length;

    // Step c: Deduplicate filtered articles
    const deduped = await this.deduplicate(filtered);
    const duplicatesRemoved = filtered.length - deduped.length;

    // Step d: For each category, rank articles with per-category cap
    const enabledCategories = this.coverageCategories.filter(
      c => c.enabled && categories.includes(c.id)
    );
    const categorizedArticles = await this.assignCategories(deduped, enabledCategories);

    const allRanked: RankedArticle[] = [];
    for (const cat of enabledCategories) {
      const articlesInCategory = categorizedArticles.get(cat.id) || [];
      const ranked = await rankArticles(
        articlesInCategory,
        cat.name,
        this.articleCaps.perCategory,
        this.llmConfig
      );
      allRanked.push(...ranked.map(r => ({ ...r, category: cat.id })));
    }

    // Step e: Generate three-layer treatments for each ranked article
    const curatedArticles: CuratedArticle[] = [];
    for (const ranked of allRanked) {
      const treatment = await this.generateArticleTreatment(ranked.article);
      const category = (ranked as RankedArticle & { category?: string }).category || '';
      curatedArticles.push({
        id: uuidv4(),
        rawArticleId: ranked.article.id,
        title: ranked.article.title,
        url: ranked.article.url,
        publishedAt: ranked.article.publishedAt,
        summary: treatment.summary,
        whyItMatters: treatment.whyItMatters,
        useCases: treatment.useCases,
        category,
        relevanceScore: ranked.relevanceScore,
        dedupeGroupId: (ranked.article as RawArticle & { dedupeGroupId?: string }).dedupeGroupId || uuidv4(),
      });
    }

    // Step f: Select tool radar entries
    const toolRadar = await this.selectToolRadar(toolRadarCandidates);

    // Step g: Enforce total article cap (full articles + tool radar ≤ totalMax)
    const totalMax = this.articleCaps.totalMax;
    const toolRadarCount = toolRadar.length;
    const maxFullArticles = totalMax - toolRadarCount;

    let cappedArticles = curatedArticles;
    let articlesCapped = 0;
    if (curatedArticles.length > maxFullArticles) {
      // Sort by relevance score descending, keep top N
      cappedArticles = [...curatedArticles]
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, Math.max(0, maxFullArticles));
      articlesCapped = curatedArticles.length - cappedArticles.length;
    }

    // Step h: Build and return CurationResult
    return {
      articles: cappedArticles,
      toolRadar,
      totalRawArticles,
      duplicatesRemoved,
      filteredOut,
      articlesCapped,
    };
  }

  async filterContent(
    articles: RawArticle[],
    criteria: ContentFilterCriteria
  ): Promise<RawArticle[]> {
    return filterContent(articles, criteria, this.llmConfig);
  }

  async deduplicate(articles: RawArticle[]): Promise<RawArticle[]> {
    return deduplicate(articles, this.llmConfig);
  }

  async rankArticles(
    articles: RawArticle[],
    category: string
  ): Promise<RawArticle[]> {
    const ranked = await rankArticles(
      articles,
      category,
      this.articleCaps.perCategory,
      this.llmConfig
    );
    return ranked.map(r => r.article);
  }

  async generateArticleTreatment(
    article: RawArticle
  ): Promise<{ summary: string; whyItMatters: string; useCases: string[] }> {
    return generateArticleTreatment(article, this.llmConfig);
  }

  async selectToolRadar(candidates: RawArticle[]): Promise<ToolRadarEntry[]> {
    return selectToolRadar(
      candidates,
      this.articleCaps.toolRadarEntries,
      this.llmConfig
    );
  }

  /**
   * Assign articles to categories using LLM classification with keyword fallback.
   * The LLM understands context — e.g. "Gemma 4" belongs to Google even without
   * the word "google" appearing in the article.
   */
  private async assignCategories(
    articles: RawArticle[],
    categories: CoverageCategory[]
  ): Promise<Map<string, RawArticle[]>> {
    try {
      return await this.assignCategoriesWithLLM(articles, categories);
    } catch (error) {
      console.warn(
        `LLM categorization failed, falling back to keyword matching: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return this.assignCategoriesWithKeywords(articles, categories);
    }
  }

  private async assignCategoriesWithLLM(
    articles: RawArticle[],
    categories: CoverageCategory[]
  ): Promise<Map<string, RawArticle[]>> {
    const result = new Map<string, RawArticle[]>();
    for (const cat of categories) {
      result.set(cat.id, []);
    }

    const BATCH_SIZE = 20;
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const assignments = await this.classifyCategoryBatch(batch, categories);
      for (let j = 0; j < batch.length; j++) {
        const catId = assignments[j];
        if (catId && result.has(catId)) {
          result.get(catId)!.push(batch[j]);
        }
      }
    }

    return result;
  }

  private async classifyCategoryBatch(
    articles: RawArticle[],
    categories: CoverageCategory[]
  ): Promise<(string | null)[]> {
    const categoryDescriptions = categories
      .map(c => `"${c.id}" — ${c.name} (e.g. ${c.keywords.slice(0, 5).join(', ')})`)
      .join('\n');

    const articleSummaries = articles.map((a, idx) => {
      const snippet = a.rawContent.substring(0, 300);
      return `[${idx}] Title: ${a.title}\nContent: ${snippet}`;
    }).join('\n\n');

    const prompt = `You are categorizing articles for an AI newsletter. Assign each article to the single best-matching category based on what the article is actually about, not just keyword matching.

Available categories:
${categoryDescriptions}

Use your knowledge of the AI ecosystem. For example:
- "Gemma 4" is a Google model → category "google"
- "Llama 4" is a Meta model → category "meta-ai"
- "GPT-5" is an OpenAI model → category "openai"
- "Kiro" is an AWS AI IDE → category "aws"
- A new open-source tool → category "builder-tools-oss"

If an article doesn't clearly fit any category, respond with "none" for that article.

Articles:
${articleSummaries}

Respond with ONLY a JSON array of category IDs (or "none"), one per article, in order.
Example: ["google", "openai", "none", "builder-tools-oss"]`;

    const response = await callLLM(this.llmConfig, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 512,
    });

    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse LLM category response as JSON array');
    }

    const parsed = JSON.parse(jsonMatch[0]) as string[];
    const validIds = new Set(categories.map(c => c.id));

    return articles.map((_, idx) => {
      const catId = parsed[idx]?.toLowerCase().trim();
      if (!catId || catId === 'none' || !validIds.has(catId)) {
        return null;
      }
      return catId;
    });
  }

  /**
   * Keyword-based fallback for category assignment.
   */
  private assignCategoriesWithKeywords(
    articles: RawArticle[],
    categories: CoverageCategory[]
  ): Map<string, RawArticle[]> {
    const result = new Map<string, RawArticle[]>();
    for (const cat of categories) {
      result.set(cat.id, []);
    }

    for (const article of articles) {
      const text = `${article.title} ${article.rawContent}`.toLowerCase();
      let bestCategory: string | null = null;
      let bestMatchCount = 0;

      for (const cat of categories) {
        const matchCount = cat.keywords.filter(kw =>
          text.includes(kw.toLowerCase())
        ).length;
        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          bestCategory = cat.id;
        }
      }

      if (bestCategory) {
        result.get(bestCategory)!.push(article);
      }
    }

    return result;
  }
}
