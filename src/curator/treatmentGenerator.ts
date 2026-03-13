// Three-layer article treatment generator
// Generates Summary, Why This Matters, and What You Can Build for each article
// Falls back to raw content extraction if LLM fails

import { RawArticle, LLMConfig } from '../types';
import { callLLM } from './llmClient';

export interface ArticleTreatment {
  summary: string;
  whyItMatters: string;
  useCases: string[];
}

/**
 * Generate a three-layer article treatment using LLM with fallback.
 *
 * LLM path: Sends article title and content to the LLM, requesting JSON
 * with summary (2-3 sentences), whyItMatters (paragraph), and useCases (3-4 bullets).
 *
 * Fallback path: If LLM fails, extracts first 2-3 sentences from rawContent
 * as summary, sets whyItMatters to empty string, useCases to empty array.
 */
export async function generateArticleTreatment(
  article: RawArticle,
  llmConfig: LLMConfig
): Promise<ArticleTreatment> {
  try {
    return await generateWithLLM(article, llmConfig);
  } catch (error) {
    console.warn(
      `LLM treatment generation failed for "${article.title}", using fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return generateFallback(article);
  }
}

async function generateWithLLM(
  article: RawArticle,
  llmConfig: LLMConfig
): Promise<ArticleTreatment> {
  const contentSnippet = article.rawContent.substring(0, 2000);

  const prompt = `You are a technical editor for an AI newsletter targeting solo founders, product managers, and vibe coders — people actively building products with AI.

Given the following article, generate a three-layer treatment as JSON:

Title: ${article.title}
Content: ${contentSnippet}

Generate a JSON object with these fields:
1. "summary": 2-3 sentences describing what happened in technical terms. Be precise and factual.
2. "whyItMatters": A paragraph explaining the real implications for product development, cost, or architecture decisions. Focus on what this means for someone building with AI today.
3. "useCases": An array of 3-4 concrete, actionable bullet points under "What You Can Build / Key Use Cases". Each should be something a solo founder or small team could actually implement.

Respond with ONLY valid JSON, no markdown fences or extra text.
Example format:
{"summary": "...", "whyItMatters": "...", "useCases": ["...", "...", "..."]}`;

  const response = await callLLM(llmConfig, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1024,
  });

  const treatment = parseTreatmentResponse(response);
  validateTreatment(treatment);
  return treatment;
}

/**
 * Parse the LLM JSON response into an ArticleTreatment.
 */
function parseTreatmentResponse(response: string): ArticleTreatment {
  // Try to extract JSON object from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse LLM response as JSON object');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('Missing or empty summary in LLM response');
  }
  if (typeof parsed.whyItMatters !== 'string' || !parsed.whyItMatters.trim()) {
    throw new Error('Missing or empty whyItMatters in LLM response');
  }
  if (!Array.isArray(parsed.useCases) || parsed.useCases.length === 0) {
    throw new Error('Missing or empty useCases in LLM response');
  }

  return {
    summary: parsed.summary.trim(),
    whyItMatters: parsed.whyItMatters.trim(),
    useCases: parsed.useCases.map((uc: unknown) => String(uc).trim()),
  };
}

/**
 * Validate the treatment meets the structural requirements:
 * - summary: 2-3 sentences
 * - whyItMatters: non-empty
 * - useCases: 3-4 items
 */
function validateTreatment(treatment: ArticleTreatment): void {
  const sentenceCount = countSentences(treatment.summary);
  if (sentenceCount < 2 || sentenceCount > 3) {
    throw new Error(
      `Summary should have 2-3 sentences, got ${sentenceCount}`
    );
  }

  if (!treatment.whyItMatters.trim()) {
    throw new Error('whyItMatters must be non-empty');
  }

  if (treatment.useCases.length < 3 || treatment.useCases.length > 4) {
    throw new Error(
      `useCases should have 3-4 items, got ${treatment.useCases.length}`
    );
  }
}

/**
 * Count sentences in text by splitting on sentence-ending punctuation.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // Split on sentence-ending punctuation followed by space or end of string
  const sentences = trimmed.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 0);
  return sentences.length;
}

/**
 * Fallback treatment when LLM is unavailable.
 * Extracts first 2-3 sentences from raw content as summary.
 */
export function generateFallback(article: RawArticle): ArticleTreatment {
  const summary = extractFirstSentences(article.rawContent, 3);
  return {
    summary: summary || article.title,
    whyItMatters: '',
    useCases: [],
  };
}

/**
 * Extract the first N sentences from text.
 */
function extractFirstSentences(text: string, maxSentences: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const sentencePattern = /[^.!?]*[.!?]+/g;
  const sentences: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(trimmed)) !== null && sentences.length < maxSentences) {
    const sentence = match[0].trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }

  return sentences.join(' ').trim();
}
