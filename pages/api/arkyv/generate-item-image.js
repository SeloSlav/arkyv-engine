const ITEM_IMAGE_SIZE = 128;

const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const name = clean(req.body?.name, 80);
    const description = clean(req.body?.description, 800);
    const primitiveKind = clean(req.body?.primitiveKind, 40) || 'item';
    const tags = Array.isArray(req.body?.tags)
        ? req.body.tags.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 12)
        : [];

    if (!name || !description) {
        return res.status(400).json({ error: 'Item name and description are required.' });
    }

    const apiKey = process.env.RETRO_DIFFUSION_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'RetroDiffusion API key not configured.' });
    }

    const prompt = [
        `Single ${primitiveKind} inventory item: ${name}.`,
        description,
        tags.length ? `Materials and themes: ${tags.join(', ')}.` : '',
        'Centered game inventory icon, entire object visible, isolated silhouette, clean dark neutral background, no hands, no character, no text, no border, crisp readable pixel art, strong contrast.',
    ].filter(Boolean).join(' ');

    try {
        const response = await fetch('https://api.retrodiffusion.ai/v1/inferences', {
            method: 'POST',
            headers: {
                'X-RD-Token': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                width: ITEM_IMAGE_SIZE,
                height: ITEM_IMAGE_SIZE,
                prompt,
                num_images: 1,
                prompt_style: 'rd_fast__default',
            }),
        });

        if (!response.ok) {
            const details = await response.text();
            const insufficientCredits = response.status === 402
                || response.status === 403
                || details.toLowerCase().includes('credit');
            return res.status(insufficientCredits ? 402 : response.status).json({
                error: insufficientCredits ? 'INSUFFICIENT_CREDITS' : 'Failed to generate item art.',
                message: insufficientCredits ? 'RetroDiffusion does not have enough credit for this generation.' : undefined,
                details,
            });
        }

        const data = await response.json();
        const image = data.base64_images?.[0];
        if (!image) {
            return res.status(500).json({ error: 'RetroDiffusion returned no image.' });
        }

        return res.status(200).json({
            success: true,
            imageUrl: `data:image/png;base64,${image}`,
            width: ITEM_IMAGE_SIZE,
            height: ITEM_IMAGE_SIZE,
            creditsRemaining: data.remaining_credits,
        });
    } catch (error) {
        console.error('Error generating item art:', error);
        return res.status(500).json({
            error: 'Unable to generate item art.',
            details: error instanceof Error ? error.message : String(error),
        });
    }
}
