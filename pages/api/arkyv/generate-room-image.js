import { createClient } from '@supabase/supabase-js';

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

        const base64Image = rdData.base64_images[0];
        
        // Initialize Supabase client with service role key for admin operations
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log('Supabase URL:', supabaseUrl ? 'Set' : 'MISSING');
        console.log('Service Role Key:', supabaseServiceKey ? 'Set (length: ' + supabaseServiceKey.length + ')' : 'MISSING');
        
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Supabase configuration missing' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        // Upload to Supabase Storage
        const fileName = `room-${roomId}-${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('room-images')
            .upload(fileName, imageBuffer, {
                contentType: 'image/png',
                upsert: false
            });

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            return res.status(500).json({ 
                error: 'Failed to upload image to storage',
                details: uploadError.message 
            });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('room-images')
            .getPublicUrl(fileName);

        // Update room record with image URL
        const { error: updateError } = await supabase
            .from('rooms')
            .update({ image_url: publicUrl })
            .eq('id', roomId);

        if (updateError) {
            console.error('Database update error:', updateError);
            console.error('Full error object:', JSON.stringify(updateError, null, 2));
            console.error('Room ID:', roomId);
            console.error('Public URL:', publicUrl);
            return res.status(500).json({ 
                error: 'Failed to update room record',
                details: updateError.message,
                code: updateError.code,
                hint: updateError.hint
            });
        }

        console.log('Image generated and saved successfully:', publicUrl);

        return res.status(200).json({ 
            success: true,
            imageUrl: publicUrl,
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

