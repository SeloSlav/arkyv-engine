import { generateImage, imageProviderErrorResponse } from '@/lib/imageProvider';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { roomId, roomName, roomDescription, regionDescription } = req.body;

    if (!roomId || !roomDescription) {
        return res.status(400).json({ error: 'Room ID and description are required' });
    }

    try {
        console.log('Generating image for room:', roomName);
        
        // Build the prompt, optionally including region description for mood/style
        let fullPrompt = roomDescription;
        if (regionDescription) {
            fullPrompt = `${roomDescription}\n\nRegion atmosphere and style: ${regionDescription}`;
            console.log('Including region description in prompt');
        }
        
        // Keep the existing compact 16:9 output used by the room UI and
        // replicated database, regardless of the configured provider.
        const generated = await generateImage({
            prompt: fullPrompt,
            width: 384,
            height: 216,
        });

        return res.status(200).json({ 
            success: true,
            imageUrl: generated.imageUrl,
            provider: generated.provider,
            providerLabel: generated.providerLabel,
            creditsRemaining: generated.creditsRemaining,
        });

    } catch (error) {
        console.error('Error generating room image:', error);
        const response = imageProviderErrorResponse(error, 'Unable to generate room image.');
        return res.status(response.status).json(response.body);
    }
}

