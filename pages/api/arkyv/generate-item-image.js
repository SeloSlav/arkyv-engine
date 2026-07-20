import { generateImage, imageProviderErrorResponse } from '@/lib/imageProvider';

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

    const prompt = [
        `Single ${primitiveKind} inventory item: ${name}.`,
        description,
        tags.length ? `Materials and themes: ${tags.join(', ')}.` : '',
        'Centered game inventory icon, entire object visible, isolated silhouette, clean dark neutral background, no hands, no character, no text, no border, crisp readable pixel art, strong contrast.',
    ].filter(Boolean).join(' ');

    try {
        const generated = await generateImage({
            prompt,
            width: ITEM_IMAGE_SIZE,
            height: ITEM_IMAGE_SIZE,
        });

        return res.status(200).json({
            success: true,
            imageUrl: generated.imageUrl,
            width: ITEM_IMAGE_SIZE,
            height: ITEM_IMAGE_SIZE,
            provider: generated.provider,
            providerLabel: generated.providerLabel,
            creditsRemaining: generated.creditsRemaining,
        });
    } catch (error) {
        console.error('Error generating item art:', error);
        const response = imageProviderErrorResponse(error, 'Unable to generate item art.');
        return res.status(response.status).json(response.body);
    }
}
