export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const rdApiKey = process.env.RETRO_DIFFUSION_API_KEY;
        if (!rdApiKey) {
            return res.status(500).json({ error: 'RetroDiffusion API key not configured' });
        }

        const rdResponse = await fetch('https://api.retrodiffusion.ai/v1/inferences/credits', {
            method: 'GET',
            headers: {
                'X-RD-Token': rdApiKey,
            }
        });

        if (!rdResponse.ok) {
            const errorText = await rdResponse.text();
            console.error('RetroDiffusion API error:', errorText);
            return res.status(rdResponse.status).json({ 
                error: 'Failed to fetch credits',
                details: errorText 
            });
        }

        const data = await rdResponse.json();
        
        return res.status(200).json({ 
            credits: data.credits || 0
        });

    } catch (error) {
        console.error('Error fetching credits:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
}

