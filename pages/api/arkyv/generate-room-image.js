export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { roomId, roomName, roomDescription, regionDescription } = req.body;

    if (!roomId || !roomDescription) {
        return res.status(400).json({ error: 'Room ID and description are required' });
    }

    try {
        // Call RetroDiffusion API
        const rdApiKey = process.env.RETRO_DIFFUSION_API_KEY;
        if (!rdApiKey) {
            return res.status(500).json({ error: 'RetroDiffusion API key not configured' });
        }

        console.log('Generating image for room:', roomName);
        
        // Build the prompt, optionally including region description for mood/style
        let fullPrompt = roomDescription;
        if (regionDescription) {
            fullPrompt = `${roomDescription}\n\nRegion atmosphere and style: ${regionDescription}`;
            console.log('Including region description in prompt');
        }
        
        // Generate 16:9 aspect ratio image (384x216 for pixel art)
        const rdResponse = await fetch('https://api.retrodiffusion.ai/v1/inferences', {
            method: 'POST',
            headers: {
                'X-RD-Token': rdApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                width: 384,
                height: 216,
                prompt: fullPrompt,
                num_images: 1,
                prompt_style: 'rd_fast__default'
            })
        });

        if (!rdResponse.ok) {
            const errorText = await rdResponse.text();
            console.error('RetroDiffusion API error:', errorText);
            
            // Check if it's a credits issue
            if (rdResponse.status === 402 || rdResponse.status === 403 || errorText.toLowerCase().includes('credit')) {
                return res.status(402).json({ 
                    error: 'INSUFFICIENT_CREDITS',
                    message: 'Not enough credits to generate image. You need 2 credits.',
                    details: errorText 
                });
            }
            
            return res.status(rdResponse.status).json({ 
                error: 'Failed to generate image',
                details: errorText 
            });
        }

        const rdData = await rdResponse.json();
        
        if (!rdData.base64_images || rdData.base64_images.length === 0) {
            return res.status(500).json({ error: 'No image generated' });
        }

        const imageUrl = `data:image/png;base64,${rdData.base64_images[0]}`;

        return res.status(200).json({ 
            success: true,
            imageUrl,
            creditsRemaining: rdData.remaining_credits
        });

    } catch (error) {
        console.error('Error generating room image:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
}

