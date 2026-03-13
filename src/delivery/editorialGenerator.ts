import { CuratedArticle, ToolRadarEntry, LLMConfig } from '../types';
import { callLLM } from '../curator/llmClient';

/**
 * Generate a brief editorial introduction summarizing the week's AI highlights.
 * Uses LLM for a conversational, builder-focused intro. Falls back to a simple
 * static intro if the LLM call fails.
 */
export async function generateEditorialIntro(
  articles: CuratedArticle[],
  toolRadar: ToolRadarEntry[],
  llmConfig: LLMConfig
): Promise<string> {
  if (articles.length === 0 && toolRadar.length === 0) {
    return 'Here\'s what shipped this week across the AI landscape.';
  }

  const categories = [...new Set(articles.map(a => a.category))];
  const titles = articles.map(a => a.title);

  const prompt = buildPrompt(titles, categories, toolRadar.length);

  try {
    const response = await callLLM(llmConfig, {
      messages: [
        {
          role: 'system',
          content: 'You write brief, conversational editorial introductions for an AI newsletter aimed at solo founders, PMs, and vibe coders. Keep it builder-focused and punchy.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 256,
      temperature: 0.7,
    });

    const trimmed = response.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    return buildFallbackIntro(articles.length, categories);
  } catch {
    return buildFallbackIntro(articles.length, categories);
  }
}

function buildPrompt(
  titles: string[],
  categories: string[],
  toolRadarCount: number
): string {
  let prompt = 'Write a brief editorial intro (2-4 sentences) for this week\'s AI newsletter edition. ';
  prompt += 'The audience is solo founders, PMs, and vibe coders — people actively building with AI. ';
  prompt += 'Summarize the week\'s highlights in a conversational, builder-focused tone.\n\n';
  prompt += `Categories covered: ${categories.join(', ')}\n`;
  prompt += `Article titles:\n${titles.map(t => `- ${t}`).join('\n')}\n`;
  if (toolRadarCount > 0) {
    prompt += `\nPlus ${toolRadarCount} tools in the Tool Radar section.`;
  }
  prompt += '\n\nReturn ONLY the editorial intro text, no headings or labels.';
  return prompt;
}

function buildFallbackIntro(
  articleCount: number,
  categories: string[]
): string {
  const categoryCount = categories.length;
  if (articleCount === 0) {
    return 'Here\'s what shipped this week across the AI landscape.';
  }
  return `Here's what shipped this week across the AI landscape. We've got ${articleCount} stories across ${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'} for you.`;
}
