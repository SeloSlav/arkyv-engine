/**
 * AI Provider Helper
 * 
 * Supports OpenAI, Grok, local OpenAI-compatible servers, and a custom
 * OpenAI-compatible endpoint via environment variables. Ollama, llama.cpp,
 * LM Studio, vLLM, and LocalAI can all use the local provider.
 * 
 * Environment Variables:
 * - AI_PROVIDER: "openai" (default), "grok", "local", or "custom"
 * - OPENAI_API_KEY: Your OpenAI API key
 * - GROK_API_KEY: Your Grok API key
 * - LOCAL_AI_BASE_URL: OpenAI-compatible base URL, including /v1
 * - LOCAL_AI_MODEL: Default local model name
 * - LOCAL_AI_FAST_MODEL / LOCAL_AI_SMART_MODEL / LOCAL_AI_VISION_MODEL:
 *   Optional per-task local model overrides
 * - LOCAL_AI_API_KEY: Optional key for a protected local endpoint
 * - CUSTOM_AI_BASE_URL / CUSTOM_AI_MODEL / CUSTOM_AI_API_KEY:
 *   Operator-provided OpenAI-compatible endpoint
 * - *_AGENT_MODEL: Optional Archie-specific model override
 * - *_AGENT_API: "responses" or "chat_completions"
 */

const normalizeBaseUrl = (value, fallback) => String(value || fallback).trim().replace(/\/+$/, '');
const localModel = process.env.LOCAL_AI_MODEL?.trim() || 'qwen2.5:7b';
const customModel = process.env.CUSTOM_AI_MODEL?.trim() || '';

// API Configuration
const API_CONFIG = {
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        agentModel: process.env.OPENAI_AGENT_MODEL?.trim() || 'gpt-5.6-sol',
        agentApi: process.env.OPENAI_AGENT_API?.trim() || 'responses',
        models: {
            fast: 'gpt-4o-mini',
            smart: 'gpt-4o',
            vision: 'gpt-4o',
        }
    },
    grok: {
        baseUrl: 'https://api.x.ai/v1',
        apiKey: process.env.GROK_API_KEY,
        agentModel: process.env.GROK_AGENT_MODEL?.trim() || 'grok-4.5',
        agentApi: process.env.GROK_AGENT_API?.trim() || 'responses',
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
        agentModel: process.env.LOCAL_AI_AGENT_MODEL?.trim() || process.env.LOCAL_AI_SMART_MODEL?.trim() || localModel,
        agentApi: process.env.LOCAL_AI_AGENT_API?.trim() || 'chat_completions',
        models: {
            fast: process.env.LOCAL_AI_FAST_MODEL?.trim() || localModel,
            smart: process.env.LOCAL_AI_SMART_MODEL?.trim() || localModel,
            vision: process.env.LOCAL_AI_VISION_MODEL?.trim() || localModel,
        }
    },
    custom: {
        baseUrl: normalizeBaseUrl(process.env.CUSTOM_AI_BASE_URL, ''),
        apiKey: process.env.CUSTOM_AI_API_KEY?.trim(),
        agentModel: process.env.CUSTOM_AI_AGENT_MODEL?.trim() || customModel,
        agentApi: process.env.CUSTOM_AI_AGENT_API?.trim() || 'chat_completions',
        models: {
            fast: process.env.CUSTOM_AI_FAST_MODEL?.trim() || customModel,
            smart: process.env.CUSTOM_AI_SMART_MODEL?.trim() || customModel,
            vision: process.env.CUSTOM_AI_VISION_MODEL?.trim() || customModel,
        },
    }
};

/**
 * Get the current AI provider configuration
 */
export function getAIConfig() {
    const provider = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
    const config = API_CONFIG[provider];
    
    if (!config) {
        throw new Error(`Invalid AI_PROVIDER: ${provider}. Must be "openai", "grok", "local", or "custom".`);
    }
    
    if (!config.apiKey) {
        throw new Error(`Missing API key for provider: ${provider}.`);
    }
    if (!config.baseUrl) {
        throw new Error(`Missing base URL for provider: ${provider}.`);
    }
    
    return {
        provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        models: config.models
    };
}

/**
 * Return the provider configuration used by Archie. This stays server-side;
 * callers must never serialize apiKey into a browser response.
 */
export function getAgentAIConfig() {
    const config = getAIConfig();
    const providerConfig = API_CONFIG[config.provider];
    const model = providerConfig.agentModel || providerConfig.models.smart;
    const api = providerConfig.agentApi === 'responses' ? 'responses' : 'chat_completions';
    if (!model) throw new Error(`Missing Archie model for provider: ${config.provider}.`);
    return {
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model,
        api,
    };
}

export function getAgentAIStatus() {
    try {
        const { provider, model, api } = getAgentAIConfig();
        return { available: true, provider, model, api };
    } catch (error) {
        return {
            available: false,
            provider: String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase(),
            model: null,
            api: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
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
    createChatCompletion,
    getAgentAIConfig,
    getAgentAIStatus,
};

const aiProvider = {
    getAIConfig,
    getModel,
    createChatCompletion,
    getOpenAIClientConfig,
    getModelForSDK,
    getAgentAIConfig,
    getAgentAIStatus,
};

export default aiProvider;

