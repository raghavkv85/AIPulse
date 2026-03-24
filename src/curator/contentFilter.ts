// Content filter with LLM classification and keyword-based fallback
// Filters articles based on inclusion/exclusion criteria for builder relevance

import { RawArticle, ContentFilterCriteria, LLMConfig } from '../types';
import { callLLM } from './llmClient';

/**
 * Filter articles using LLM classification with keyword-based fallback.
 * 
 * Primary path: Sends article titles and content snippets to the LLM,
 * which classifies each as "include" or "exclude" based on the criteria.
 * 
 * Fallback path: If the LLM call fails, uses simple keyword matching
 * against the include/exclude criteria lists.
 */
export async function filterContent(
  articles: RawArticle[],
  criteria: ContentFilterCriteria,
  llmConfig: LLMConfig
): Promise<RawArticle[]> {
  if (articles.length === 0) {
    return [];
  }

  try {
    return await filterWithLLM(articles, criteria, llmConfig);
  } catch (error) {
    console.warn(
      `LLM content filtering failed, falling back to keyword-based filtering: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return filterWithKeywords(articles, criteria);
  }
}

/**
 * Classify articles using the LLM API.
 * Batches all articles into a single prompt and parses the JSON response.
 */
async function filterWithLLM(
  articles: RawArticle[],
  criteria: ContentFilterCriteria,
  llmConfig: LLMConfig
): Promise<RawArticle[]> {
  const BATCH_SIZE = 20;
  const results: RawArticle[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchResults = await classifyBatch(batch, criteria, llmConfig);
    results.push(...batchResults);
  }

  return results;
}

async function classifyBatch(
  articles: RawArticle[],
  criteria: ContentFilterCriteria,
  llmConfig: LLMConfig
): Promise<RawArticle[]> {
  const articleSummaries = articles.map((a, idx) => {
    const snippet = a.rawContent.substring(0, 300);
    return `[${idx}] Title: ${a.title}\nContent: ${snippet}`;
  }).join('\n\n');

  const prompt = `You are a strict content filter for a developer-focused AI newsletter targeting solo founders, product managers, and vibe coders. The newsletter is ONLY about technical AI content that builders can act on.

Classify each article below as "include" or "exclude" based on these criteria:

INCLUDE if the article is primarily about technical AI topics such as: ${criteria.include.join(', ')}

EXCLUDE if the article is primarily about ANY of the following non-technical topics: ${criteria.exclude.join(', ')}

IMPORTANT FILTERING RULES:
- Articles about AI laws, regulations, legislation, government policy, or legal disputes should ALWAYS be excluded, even if they mention AI companies or models.
- Articles about geographic/territorial aspects of AI (country bans, trade restrictions, geopolitical competition) should ALWAYS be excluded.
- Articles about lawsuits, copyright disputes, or court rulings involving AI companies should ALWAYS be excluded.
- Articles about corporate financials (earnings, stock, IPO, funding) should ALWAYS be excluded unless they announce a specific new technical product or API.
- When in doubt, EXCLUDE. Only include articles that provide actionable technical information for builders.

Articles:
${articleSummaries}

Respond with ONLY a JSON array of decisions, one per article, in order. Each element should be "include" or "exclude".
Example: ["include", "exclude", "include"]`;

  const response = await callLLM(llmConfig, {
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    maxTokens: 512,
  });

  const decisions = parseDecisions(response, articles.length);

  return articles.filter((_, idx) => decisions[idx] === 'include');
}

/**
 * Parse the LLM response into an array of "include"/"exclude" decisions.
 * Handles various response formats gracefully.
 */
function parseDecisions(response: string, expectedCount: number): string[] {
  // Try to extract a JSON array from the response
  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse LLM response as JSON array');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not an array');
  }

  // Tolerate slight mismatch — pad with "include" if LLM returned fewer
  while (parsed.length < expectedCount) {
    parsed.push('include');
  }

  return parsed.slice(0, expectedCount).map((d: unknown) => {
    const decision = String(d).toLowerCase().trim();
    return decision === 'include' ? 'include' : 'exclude';
  });
}

/**
 * Keyword-based fallback filter.
 * Includes an article if its title or content contains any include keyword
 * AND does not match any exclude keyword.
 */
export function filterWithKeywords(
  articles: RawArticle[],
  criteria: ContentFilterCriteria
): RawArticle[] {
  return articles.filter(article => {
    const text = `${article.title} ${article.rawContent}`.toLowerCase();

    const matchesInclude = criteria.include.length === 0 ||
      criteria.include.some(keyword => text.includes(keyword.toLowerCase()));

    const matchesExclude = criteria.exclude.some(
      keyword => text.includes(keyword.toLowerCase())
    );

    return matchesInclude && !matchesExclude;
  });
}
