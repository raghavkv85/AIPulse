// Tool Radar selection — selects 3-4 best tool candidates and generates compact entries
// Uses LLM for intelligent selection with a basic fallback

import { RawArticle, ToolRadarEntry, LLMConfig } from '../types';
import { callLLM } from './llmClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Select the best tool radar candidates and generate compact entries.
 *
 * LLM path: Sends candidate titles and content to the LLM, asks it to
 * select the best 3-4 tools and generate name, oneLiner, description,
 * and bestFor for each. Returns JSON array of ToolRadarEntry objects.
 *
 * Fallback path: If LLM fails, selects the most recent candidates and
 * generates basic entries from the raw data (title as name, first sentence
 * as description, generic bestFor tag).
 */
export async function selectToolRadar(
  candidates: RawArticle[],
  maxEntries: number,
  llmConfig: LLMConfig
): Promise<ToolRadarEntry[]> {
  if (candidates.length === 0) return [];

  const cap = Math.min(maxEntries, candidates.length);

  try {
    return await selectWithLLM(candidates, cap, llmConfig);
  } catch (error) {
    console.warn(
      `LLM Tool Radar selection failed, falling back to basic selection: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return selectFallback(candidates, cap);
  }
}


/**
 * Use the LLM to select the best tool candidates and generate compact entries.
 */
async function selectWithLLM(
  candidates: RawArticle[],
  maxEntries: number,
  llmConfig: LLMConfig
): Promise<ToolRadarEntry[]> {
  const candidateSummaries = candidates
    .map((c, idx) => {
      const snippet = c.rawContent.substring(0, 500);
      return `[${idx}] Title: ${c.title}\nURL: ${c.url}\nContent: ${snippet}`;
    })
    .join('\n\n');

  const prompt = `You are curating the "Tool Radar" section of an AI newsletter for solo founders, vibe coders, and small teams building products with AI.

From the following tool candidates, select the best ${maxEntries} tools and generate a compact entry for each.

Candidates:
${candidateSummaries}

For each selected tool, generate a JSON object with:
- "index": the candidate index number from the list above
- "name": a clean tool name (not the full article title)
- "oneLiner": a single-sentence description of what the tool does
- "description": a short paragraph (2-3 sentences) on why it's useful for builders
- "bestFor": a "Best for" tag targeting the audience (e.g., "Solo founders building MVPs", "Vibe coders prototyping fast", "Small teams shipping AI features")

Respond with ONLY a JSON array of objects. No markdown fences or extra text.
Example: [{"index": 0, "name": "ToolName", "oneLiner": "...", "description": "...", "bestFor": "..."}]`;

  const response = await callLLM(llmConfig, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1500,
  });

  return parseLLMResponse(response, candidates);
}

/**
 * Parse the LLM response into ToolRadarEntry objects.
 */
function parseLLMResponse(
  response: string,
  candidates: RawArticle[]
): ToolRadarEntry[] {
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse LLM response as JSON array');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('LLM response is not a non-empty array');
  }

  return parsed.map((entry: Record<string, unknown>) => {
    const idx = Number(entry.index);
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
      throw new Error(`Invalid candidate index: ${entry.index}`);
    }

    const name = String(entry.name || '').trim();
    const oneLiner = String(entry.oneLiner || '').trim();
    const description = String(entry.description || '').trim();
    const bestFor = String(entry.bestFor || '').trim();

    if (!name || !oneLiner || !description || !bestFor) {
      throw new Error('Tool Radar entry missing required fields');
    }

    const candidate = candidates[idx];
    return {
      id: uuidv4(),
      rawArticleId: candidate.id,
      name,
      oneLiner,
      description,
      bestFor,
      url: candidate.url,
    };
  });
}

/**
 * Fallback: select the most recent candidates and generate basic entries.
 */
export function selectFallback(
  candidates: RawArticle[],
  maxEntries: number
): ToolRadarEntry[] {
  // Sort by most recent first
  const sorted = [...candidates].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );

  const selected = sorted.slice(0, maxEntries);

  return selected.map(candidate => ({
    id: uuidv4(),
    rawArticleId: candidate.id,
    name: candidate.title,
    oneLiner: extractFirstSentence(candidate.rawContent) || candidate.title,
    description: extractFirstSentence(candidate.rawContent) || candidate.title,
    bestFor: 'Solo founders and small teams',
    url: candidate.url,
  }));
}

/**
 * Extract the first sentence from text content.
 */
function extractFirstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : trimmed.substring(0, 100);
}
