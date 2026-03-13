// Deduplication with LLM-assisted similarity and Jaccard fallback
// Groups articles covering the same news event, keeps the best representative per group

import { RawArticle, LLMConfig } from '../types';
import { callLLM } from './llmClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Deduplicate articles using LLM grouping with a title-similarity fallback.
 *
 * LLM path: sends article titles to the LLM, asks it to group articles
 * covering the same news event, then keeps the best representative per group.
 *
 * Fallback path: uses Jaccard similarity on title word sets (>60% overlap)
 * to group articles when the LLM call fails.
 *
 * Returns only the representative articles (one per group) with dedupeGroupId assigned.
 */
export async function deduplicate(
  articles: RawArticle[],
  llmConfig: LLMConfig
): Promise<RawArticle[]> {
  if (articles.length === 0) return [];
  if (articles.length === 1) {
    return [{ ...articles[0], dedupeGroupId: uuidv4() } as RawArticle & { dedupeGroupId: string }];
  }

  let groups: number[][];
  try {
    groups = await groupWithLLM(articles, llmConfig);
  } catch (error) {
    console.warn(
      `LLM deduplication failed, falling back to title-similarity heuristic: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    groups = groupByTitleSimilarity(articles);
  }

  return selectRepresentatives(articles, groups);
}


/**
 * Use the LLM to group articles by the news event they cover.
 * Returns an array of groups, where each group is an array of article indices.
 */
async function groupWithLLM(
  articles: RawArticle[],
  llmConfig: LLMConfig
): Promise<number[][]> {
  const titlesBlock = articles
    .map((a, idx) => `[${idx}] ${a.title}`)
    .join('\n');

  const prompt = `You are deduplicating articles for an AI newsletter. Below is a numbered list of article titles. Group articles that cover the same news event together.

Articles:
${titlesBlock}

Respond with ONLY a JSON array of groups. Each group is an array of article indices.
Articles that don't match any other article should be in their own single-element group.
Example: [[0, 3], [1], [2, 4, 5]]`;

  const response = await callLLM(llmConfig, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    maxTokens: 512,
  });

  return parseGroups(response, articles.length);
}

/**
 * Parse the LLM response into an array of index groups.
 * Validates that every article index appears exactly once.
 */
function parseGroups(response: string, articleCount: number): number[][] {
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse LLM response as JSON array');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not an array');
  }

  // Validate: every index 0..articleCount-1 must appear exactly once
  const seen = new Set<number>();
  for (const group of parsed) {
    if (!Array.isArray(group)) throw new Error('Group is not an array');
    for (const idx of group) {
      if (typeof idx !== 'number' || idx < 0 || idx >= articleCount) {
        throw new Error(`Invalid article index: ${idx}`);
      }
      if (seen.has(idx)) {
        throw new Error(`Duplicate article index: ${idx}`);
      }
      seen.add(idx);
    }
  }

  // If some indices are missing, add them as singleton groups
  for (let i = 0; i < articleCount; i++) {
    if (!seen.has(i)) {
      parsed.push([i]);
    }
  }

  return parsed;
}


/**
 * Fallback: group articles by Jaccard similarity on title word sets.
 * Articles with >60% word overlap are grouped together.
 */
export function groupByTitleSimilarity(articles: RawArticle[]): number[][] {
  const wordSets = articles.map(a => titleToWordSet(a.title));
  const assigned = new Set<number>();
  const groups: number[][] = [];

  for (let i = 0; i < articles.length; i++) {
    if (assigned.has(i)) continue;
    const group = [i];
    assigned.add(i);

    for (let j = i + 1; j < articles.length; j++) {
      if (assigned.has(j)) continue;
      if (jaccardSimilarity(wordSets[i], wordSets[j]) > 0.6) {
        group.push(j);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Convert a title string to a set of lowercase words (stripped of punctuation).
 */
function titleToWordSet(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );
}

/**
 * Compute Jaccard similarity between two word sets: |A ∩ B| / |A ∪ B|.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * From each group, select the best representative article:
 * - Prefer the article with the longest rawContent
 * - Tie-break by earliest publishedAt
 * Assign a unique dedupeGroupId to each group.
 */
function selectRepresentatives(
  articles: RawArticle[],
  groups: number[][]
): RawArticle[] {
  return groups.map(group => {
    const groupId = uuidv4();

    // Sort: longest content first, then earliest published
    const sorted = [...group].sort((a, b) => {
      const contentDiff = articles[b].rawContent.length - articles[a].rawContent.length;
      if (contentDiff !== 0) return contentDiff;
      return articles[a].publishedAt.getTime() - articles[b].publishedAt.getTime();
    });

    const best = articles[sorted[0]];
    return { ...best, dedupeGroupId: groupId } as RawArticle & { dedupeGroupId: string };
  });
}
