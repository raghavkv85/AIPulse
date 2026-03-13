// Article ranking by relevance and recency
// Uses LLM to score relevance for builder audience, with recency-only fallback

import { RawArticle, LLMConfig } from '../types';
import { callLLM } from './llmClient';

export interface RankedArticle {
  article: RawArticle;
  relevanceScore: number;
}

/**
 * Rank articles by relevance to the builder audience within a given category.
 *
 * LLM path: Sends article titles and snippets to the LLM, asks it to score
 * each 0-1 for relevance to builders (solo founders, PMs, vibe coders)
 * within the given category. Returns JSON array of scores.
 *
 * Fallback path: If LLM fails, uses recency-only ranking (most recent first)
 * with a simple score based on recency.
 *
 * Results are sorted by relevance score descending and capped at perCategoryCap.
 */
export async function rankArticles(
  articles: RawArticle[],
  category: string,
  perCategoryCap: number,
  llmConfig: LLMConfig
): Promise<RankedArticle[]> {
  if (articles.length === 0) return [];

  let ranked: RankedArticle[];
  try {
    ranked = await rankWithLLM(articles, category, llmConfig);
  } catch (error) {
    console.warn(
      `LLM ranking failed for category "${category}", falling back to recency-only ranking: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    ranked = rankByRecency(articles);
  }

  // Sort by relevance score descending
  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Apply per-category cap
  if (ranked.length > perCategoryCap) {
    return ranked.slice(0, perCategoryCap);
  }

  return ranked;
}


/**
 * Use the LLM to score each article's relevance to the builder audience
 * within the given category.
 */
async function rankWithLLM(
  articles: RawArticle[],
  category: string,
  llmConfig: LLMConfig
): Promise<RankedArticle[]> {
  const articleSummaries = articles
    .map((a, idx) => {
      const snippet = a.rawContent.substring(0, 300);
      return `[${idx}] Title: ${a.title}\nSnippet: ${snippet}`;
    })
    .join('\n\n');

  const prompt = `You are ranking articles for an AI newsletter in the "${category}" category. The target audience is solo founders, product managers, and vibe coders — people actively building products with AI.

Score each article from 0 to 1 for relevance to this builder audience within the "${category}" category. Higher scores mean more relevant and actionable for builders.

Consider:
- How directly actionable is this for someone building with AI?
- Does it cover new APIs, tools, SDKs, model releases, or pricing changes?
- Is it specific to the "${category}" category?

Articles:
${articleSummaries}

Respond with ONLY a JSON array of numbers (scores between 0 and 1), one per article, in order.
Example: [0.9, 0.5, 0.8]`;

  const response = await callLLM(llmConfig, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    maxTokens: 256,
  });

  const scores = parseScores(response, articles.length);

  return articles.map((article, idx) => ({
    article,
    relevanceScore: scores[idx],
  }));
}

/**
 * Parse the LLM response into an array of numeric scores.
 * Each score is clamped to [0, 1].
 */
function parseScores(response: string, expectedCount: number): number[] {
  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse LLM response as JSON array');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} scores, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`
    );
  }

  return parsed.map((s: unknown) => {
    const score = Number(s);
    if (isNaN(score)) {
      throw new Error(`Invalid score value: ${s}`);
    }
    return Math.max(0, Math.min(1, score));
  });
}

/**
 * Fallback: rank articles by recency (most recent first).
 * Assigns a score based on relative position: most recent gets 1.0,
 * oldest gets a score approaching 0 (but never exactly 0 for non-empty sets).
 */
export function rankByRecency(articles: RawArticle[]): RankedArticle[] {
  if (articles.length === 0) return [];

  // Sort by publishedAt descending (most recent first)
  const sorted = [...articles].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );

  return sorted.map((article, idx) => ({
    article,
    // Linear decay: most recent = 1.0, least recent approaches 0
    relevanceScore: articles.length === 1 ? 1.0 : 1 - idx / articles.length,
  }));
}
