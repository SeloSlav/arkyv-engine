const RETRO_DIFFUSION_BASE_URL = 'https://api.retrodiffusion.ai/v1/inferences';
const DEFAULT_LOCAL_IMAGE_BASE_URL = 'http://127.0.0.1:7860';

const clean = (value) => String(value || '').trim();
const trimBaseUrl = (value, fallback) => clean(value || fallback).replace(/\/+$/, '');

const boundedNumber = (value, fallback, minimum, maximum) => {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
};

export class ImageProviderError extends Error {
    constructor(message, { status = 500, code = 'IMAGE_PROVIDER_ERROR', details = '' } = {}) {
        super(message);
        this.name = 'ImageProviderError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function getImageProviderConfig() {
    const provider = clean(process.env.IMAGE_PROVIDER || 'retrodiffusion').toLowerCase();

    if (provider === 'retrodiffusion') {
        const apiKey = clean(process.env.RETRO_DIFFUSION_API_KEY);
        if (!apiKey) {
            throw new ImageProviderError(
                'RetroDiffusion is selected but RETRO_DIFFUSION_API_KEY is not configured.',
                { code: 'IMAGE_PROVIDER_NOT_CONFIGURED' },
            );
        }
        return {
            provider,
            label: 'RetroDiffusion',
            apiKey,
            baseUrl: RETRO_DIFFUSION_BASE_URL,
        };
    }

    if (provider === 'local') {
        return {
            provider,
            label: 'Local Stable Diffusion',
            baseUrl: trimBaseUrl(process.env.LOCAL_IMAGE_BASE_URL, DEFAULT_LOCAL_IMAGE_BASE_URL),
            apiAuth: clean(process.env.LOCAL_IMAGE_API_AUTH),
            model: clean(process.env.LOCAL_IMAGE_MODEL),
            steps: Math.round(boundedNumber(process.env.LOCAL_IMAGE_STEPS, 20, 1, 150)),
            cfgScale: boundedNumber(process.env.LOCAL_IMAGE_CFG_SCALE, 7, 1, 30),
            sampler: clean(process.env.LOCAL_IMAGE_SAMPLER),
            promptPrefix: clean(process.env.LOCAL_IMAGE_PROMPT_PREFIX)
                || 'pixel art, game art, crisp edges, detailed, no text',
            negativePrompt: clean(process.env.LOCAL_IMAGE_NEGATIVE_PROMPT)
                || 'text, letters, watermark, logo, blurry, low contrast, cropped',
        };
    }

    throw new ImageProviderError(
        `Invalid IMAGE_PROVIDER: ${provider}. Must be "retrodiffusion" or "local".`,
        { code: 'IMAGE_PROVIDER_NOT_CONFIGURED' },
    );
}

const localHeaders = (config) => {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiAuth) {
        headers.Authorization = `Basic ${Buffer.from(config.apiAuth).toString('base64')}`;
    }
    return headers;
};

const responseDetails = async (response) => {
    try {
        return await response.text();
    } catch {
        return '';
    }
};

const dataUrl = (base64Image) => {
    const image = clean(base64Image);
    if (!image) return '';
    return image.startsWith('data:image/') ? image : `data:image/png;base64,${image}`;
};

async function generateWithRetroDiffusion(config, { prompt, width, height }) {
    const response = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
            'X-RD-Token': config.apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            width,
            height,
            prompt,
            num_images: 1,
            prompt_style: 'rd_fast__default',
        }),
    });

    if (!response.ok) {
        const details = await responseDetails(response);
        const insufficientCredits = response.status === 402
            || response.status === 403
            || details.toLowerCase().includes('credit');
        throw new ImageProviderError(
            insufficientCredits
                ? 'RetroDiffusion does not have enough credits for this generation.'
                : `RetroDiffusion image generation failed (${response.status}).`,
            {
                status: insufficientCredits ? 402 : response.status,
                code: insufficientCredits ? 'INSUFFICIENT_CREDITS' : 'IMAGE_PROVIDER_ERROR',
                details,
            },
        );
    }

    const payload = await response.json();
    const imageUrl = dataUrl(payload.base64_images?.[0]);
    if (!imageUrl) {
        throw new ImageProviderError('RetroDiffusion returned no image.');
    }

    return {
        imageUrl,
        provider: config.provider,
        providerLabel: config.label,
        creditsRemaining: payload.remaining_credits,
    };
}

async function generateWithLocalStableDiffusion(config, { prompt, width, height }) {
    const body = {
        prompt: `${config.promptPrefix}, ${prompt}`,
        negative_prompt: config.negativePrompt,
        width,
        height,
        steps: config.steps,
        cfg_scale: config.cfgScale,
        batch_size: 1,
        n_iter: 1,
        save_images: false,
    };

    if (config.sampler) body.sampler_name = config.sampler;
    if (config.model) {
        body.override_settings = { sd_model_checkpoint: config.model };
        body.override_settings_restore_afterwards = true;
    }

    let response;
    try {
        response = await fetch(`${config.baseUrl}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: localHeaders(config),
            body: JSON.stringify(body),
        });
    } catch (error) {
        throw new ImageProviderError(
            `Could not reach the local image server at ${config.baseUrl}. Start Stable Diffusion WebUI/Forge with its API enabled.`,
            {
                status: 503,
                code: 'LOCAL_IMAGE_UNAVAILABLE',
                details: error instanceof Error ? error.message : String(error),
            },
        );
    }

    if (!response.ok) {
        const details = await responseDetails(response);
        throw new ImageProviderError(
            `Local image generation failed (${response.status}). Check the configured model and the WebUI/Forge server log.`,
            { status: response.status, code: 'IMAGE_PROVIDER_ERROR', details },
        );
    }

    const payload = await response.json();
    const imageUrl = dataUrl(payload.images?.[0]);
    if (!imageUrl) {
        throw new ImageProviderError('The local image provider returned no image.');
    }

    return {
        imageUrl,
        provider: config.provider,
        providerLabel: config.label,
        creditsRemaining: null,
    };
}

export async function generateImage(options) {
    const config = getImageProviderConfig();
    if (config.provider === 'local') {
        return generateWithLocalStableDiffusion(config, options);
    }
    return generateWithRetroDiffusion(config, options);
}

export async function getImageProviderStatus() {
    const config = getImageProviderConfig();

    if (config.provider === 'retrodiffusion') {
        const response = await fetch(`${config.baseUrl}/credits`, {
            headers: { 'X-RD-Token': config.apiKey },
        });
        if (!response.ok) {
            const details = await responseDetails(response);
            throw new ImageProviderError(
                `Failed to fetch RetroDiffusion credits (${response.status}).`,
                { status: response.status, details },
            );
        }
        const payload = await response.json();
        return {
            provider: config.provider,
            providerLabel: config.label,
            available: true,
            credits: Number(payload.credits) || 0,
        };
    }

    let response;
    try {
        response = await fetch(`${config.baseUrl}/sdapi/v1/samplers`, {
            headers: localHeaders(config),
        });
    } catch (error) {
        throw new ImageProviderError(
            `Could not reach the local image server at ${config.baseUrl}.`,
            {
                status: 503,
                code: 'LOCAL_IMAGE_UNAVAILABLE',
                details: error instanceof Error ? error.message : String(error),
            },
        );
    }

    if (!response.ok) {
        const details = await responseDetails(response);
        throw new ImageProviderError(
            `Local image server health check failed (${response.status}).`,
            { status: response.status, code: 'LOCAL_IMAGE_UNAVAILABLE', details },
        );
    }

    return {
        provider: config.provider,
        providerLabel: config.label,
        available: true,
        credits: null,
        model: config.model || null,
    };
}

export function imageProviderErrorResponse(error, fallbackMessage) {
    if (error instanceof ImageProviderError) {
        return {
            status: error.status,
            body: {
                error: error.code === 'INSUFFICIENT_CREDITS' ? error.code : error.message,
                code: error.code,
                message: error.message,
                details: error.details || undefined,
            },
        };
    }

    return {
        status: 500,
        body: {
            error: fallbackMessage,
            message: error instanceof Error ? error.message : String(error),
        },
    };
}
