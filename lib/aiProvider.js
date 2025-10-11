/**
 * AI Provider Helper
 * 
 * Supports switching between OpenAI and Grok APIs via environment variables
 * 
 * Environment Variables:
 * - AI_PROVIDER: "openai" (default) or "grok"
 * - OPENAI_API_KEY: Your OpenAI API key
 * - GROK_API_KEY: Your Grok API key
 */

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

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
    }
};

/**
 * Get the current AI provider configuration
 */
export function getAIConfig() {
    const config = API_CONFIG[AI_PROVIDER];
    
    if (!config) {
        throw new Error(`Invalid AI_PROVIDER: ${AI_PROVIDER}. Must be "openai" or "grok"`);
    }
    
    if (!config.apiKey) {
        throw new Error(`Missing API key for provider: ${AI_PROVIDER}`);
    }
    
    return {
        provider: AI_PROVIDER,
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
        throw new Error(`AI API error (${response.status}): ${errorText}`);
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

// Export for edge functions (Deno/Supabase)
export const aiProviderConfig = {
    getConfig: getAIConfig,
    getModel,
    createChatCompletion
};

export default {
    getAIConfig,
    getModel,
    createChatCompletion,
    getOpenAIClientConfig,
    getModelForSDK
};

