// Shared LLM client helper using native fetch()
// Supports Anthropic, OpenAI, and Groq APIs

import { LLMConfig } from '../types';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call the configured LLM API and return the text response.
 * Reads the API key from the environment variable specified in llmConfig.apiKeyEnvVar.
 * Supports both Anthropic Messages API and OpenAI Chat Completions API.
 */
export async function callLLM(
  config: LLMConfig,
  options: LLMRequestOptions
): Promise<string> {
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`API key not found in environment variable: ${config.apiKeyEnvVar}`);
  }

  if (config.provider === 'anthropic') {
    return callAnthropic(apiKey, config.model, options);
  } else if (config.provider === 'openai') {
    return callOpenAI(apiKey, config.model, options);
  } else if (config.provider === 'groq') {
    return callGroq(apiKey, config.model, options);
  } else {
    throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  options: LLMRequestOptions
): Promise<string> {
  // Anthropic uses a separate system parameter, not a system message in the array
  const systemMessage = options.messages.find(m => m.role === 'system');
  const nonSystemMessages = options.messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 1024,
    messages: nonSystemMessages.map(m => ({ role: m.role, content: m.content })),
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text: string }>;
  };
  const textBlock = data.content?.find(block => block.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in Anthropic response');
  }
  return textBlock.text;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  options: LLMRequestOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 1024,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('No content in OpenAI response');
  }
  return choice.message.content;
}


async function callGroq(
  apiKey: string,
  model: string,
  options: LLMRequestOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 1024,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('No content in Groq response');
  }
  return choice.message.content;
}
