/**
 * AI Provider Helper
 * 
 * Supports OpenAI, Grok, and local OpenAI-compatible servers via environment
 * variables. Ollama, llama.cpp, LM Studio, vLLM, and LocalAI can all use the
 * local provider as long as their OpenAI-compatible endpoint is enabled.
 * 
 * Environment Variables:
 * - AI_PROVIDER: "openai" (default), "grok", or "local"
 * - OPENAI_API_KEY: Your OpenAI API key
 * - GROK_API_KEY: Your Grok API key
 * - LOCAL_AI_BASE_URL: OpenAI-compatible base URL, including /v1
 * - LOCAL_AI_MODEL: Default local model name
 * - LOCAL_AI_FAST_MODEL / LOCAL_AI_SMART_MODEL / LOCAL_AI_VISION_MODEL:
 *   Optional per-task local model overrides
 * - LOCAL_AI_API_KEY: Optional key for a protected local endpoint
 */

const normalizeBaseUrl = (value, fallback) => String(value || fallback).trim().replace(/\/+$/, '');
const localModel = process.env.LOCAL_AI_MODEL?.trim() || 'qwen2.5:7b';

// API Configuration
const API_CONFIG = {
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        models: {
            fast: 'gpt-4o-mini',
            smart: 'gpt-4o',
            vision: 'gpt-4o',
        }
    },
    grok: {
        baseUrl: 'https://api.x.ai/v1',
        apiKey: process.env.GROK_API_KEY,
        models: {
            fast: 'grok-4-fast-non-reasoning',
            smart: 'grok-4-0709',
            vision: 'grok-2-vision-1212',
        }
    },
    local: {
        baseUrl: normalizeBaseUrl(process.env.LOCAL_AI_BASE_URL, 'http://127.0.0.1:11434/v1'),
        // The OpenAI SDK requires a value. Ollama ignores it, while protected
        // OpenAI-compatible servers can receive a real key through the env var.
        apiKey: process.env.LOCAL_AI_API_KEY?.trim() || 'local',
        models: {
            fast: process.env.LOCAL_AI_FAST_MODEL?.trim() || localModel,
            smart: process.env.LOCAL_AI_SMART_MODEL?.trim() || localModel,
            vision: process.env.LOCAL_AI_VISION_MODEL?.trim() || localModel,
        }
    }
};

/**
 * Get the current AI provider configuration
 */
export function getAIConfig() {
    const provider = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
    const config = API_CONFIG[provider];
    
    if (!config) {
        throw new Error(`Invalid AI_PROVIDER: ${provider}. Must be "openai", "grok", or "local".`);
    }
    
    if (!config.apiKey) {
        throw new Error(`Missing API key for provider: ${provider}.`);
    }
    
    return {
        provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        models: config.models
    };
}

/**
 * Get model name for the current provider
 * @param {string} modelType - 'fast', 'smart', or 'vision'
 * @returns {string} The model name for the current provider
 */
export function getModel(modelType = 'fast') {
    const config = getAIConfig();
    return config.models[modelType] || config.models.fast;
}

/**
 * Make a chat completion request (fetch-based)
 * @param {Object} options - Request options
 * @param {Array} options.messages - Chat messages
 * @param {string} options.modelType - Model type: 'fast', 'smart', or 'vision'
 * @param {number} options.maxTokens - Max tokens for response
 * @param {number} options.temperature - Temperature (0-1)
 * @param {Object} options.responseFormat - Response format (e.g., { type: 'json_object' })
 * @returns {Promise<Object>} The API response
 */
export async function createChatCompletion({ 
    messages, 
    modelType = 'fast',
    maxTokens = 500, 
    temperature = 0.8,
    responseFormat = null 
}) {
    const config = getAIConfig();
    const model = getModel(modelType);
    
    const body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature
    };
    
    // Add response_format if provided (for JSON mode)
    if (responseFormat) {
        body.response_format = responseFormat;
    }
    
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        const providerHint = config.provider === 'local'
            ? ` Verify LOCAL_AI_BASE_URL (${config.baseUrl}) and that model "${model}" is installed.`
            : '';
        throw new Error(`AI API error (${response.status}): ${errorText}.${providerHint}`);
    }
    
    return await response.json();
}

/**
 * Get OpenAI SDK-compatible client configuration
 * Works with the 'openai' npm package
 */
export function getOpenAIClientConfig() {
    const config = getAIConfig();
    
    return {
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
    };
}

/**
 * Get model name for OpenAI SDK usage
 * @param {string} modelType - 'fast', 'smart', or 'vision'
 */
export function getModelForSDK(modelType = 'fast') {
    return getModel(modelType);
}

// Export for server-side API routes
export const aiProviderConfig = {
    getConfig: getAIConfig,
    getModel,
    createChatCompletion
};

const aiProvider = {
    getAIConfig,
    getModel,
    createChatCompletion,
    getOpenAIClientConfig,
    getModelForSDK
};

export default aiProvider;

