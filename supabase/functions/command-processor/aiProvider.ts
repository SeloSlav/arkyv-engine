/**
 * AI Provider Helper for Deno Edge Functions
 * 
 * Supports switching between OpenAI and Grok APIs via environment variables
 * 
 * Environment Variables:
 * - AI_PROVIDER: "openai" (default) or "grok"
 * - OPENAI_API_KEY: Your OpenAI API key
 * - GROK_API_KEY: Your Grok API key
 */

const AI_PROVIDER = Deno.env.get("AI_PROVIDER") || "openai";

// API Configuration
const API_CONFIG = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: Deno.env.get("OPENAI_API_KEY"),
    models: {
      fast: "gpt-4o-mini",
      smart: "gpt-4o",
      vision: "gpt-4o",
    },
  },
  grok: {
    baseUrl: "https://api.x.ai/v1",
    apiKey: Deno.env.get("GROK_API_KEY"),
    models: {
      fast: "grok-4-fast-non-reasoning",
      smart: "grok-4-0709",
      vision: "grok-2-vision-1212",
    },
  },
};

interface AIConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  models: {
    fast: string;
    smart: string;
    vision: string;
  };
}

/**
 * Get the current AI provider configuration
 */
export function getAIConfig(): AIConfig {
  const config = API_CONFIG[AI_PROVIDER as keyof typeof API_CONFIG];

  if (!config) {
    throw new Error(
      `Invalid AI_PROVIDER: ${AI_PROVIDER}. Must be "openai" or "grok"`,
    );
  }

  if (!config.apiKey) {
    throw new Error(`Missing API key for provider: ${AI_PROVIDER}`);
  }

  return {
    provider: AI_PROVIDER,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    models: config.models,
  };
}

/**
 * Get model name for the current provider
 * @param modelType - 'fast', 'smart', or 'vision'
 * @returns The model name for the current provider
 */
export function getModel(modelType: "fast" | "smart" | "vision" = "fast"): string {
  const config = getAIConfig();
  return config.models[modelType] || config.models.fast;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  messages: ChatMessage[];
  modelType?: "fast" | "smart" | "vision";
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
}

/**
 * Make a chat completion request
 */
export async function createChatCompletion({
  messages,
  modelType = "fast",
  maxTokens = 500,
  temperature = 0.8,
  responseFormat = undefined,
}: ChatCompletionOptions) {
  const config = getAIConfig();
  const model = getModel(modelType);

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  // Add response_format if provided (for JSON mode)
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

export default {
  getAIConfig,
  getModel,
  createChatCompletion,
};

