import { createClient } from '@supabase/supabase-js';
import { createChatCompletion } from '@/lib/aiProvider';

// Helper function to classify entity type using AI
async function classifyEntityType(description) {
    try {
        const aiData = await createChatCompletion({
            messages: [
                {
                    role: 'system',
                    content: 'You are a classifier. Analyze the description and determine if this entity is humanoid (has a face, head, human-like form) or non-humanoid (object, machine, abstract entity, animal, etc.). Respond with ONLY one word: "humanoid" or "non-humanoid".'
                },
                {
                    role: 'user',
                    content: description
                }
            ],
            modelType: 'fast',
            maxTokens: 10,
            temperature: 0
        });

        const classification = aiData?.choices?.[0]?.message?.content?.trim().toLowerCase() || 'humanoid';
        
        const result = classification.includes('non-humanoid') ? 'non-humanoid' : 'humanoid';
        console.log(`Classification result: ${result}`);
        return result;
    } catch (error) {
        console.warn('Error classifying entity, defaulting to humanoid:', error.message);
        return 'humanoid'; // Default to humanoid on error
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { npcId, npcName, npcDescription, regionDescription } = req.body;

    if (!npcId || !npcDescription) {
        return res.status(400).json({ error: 'NPC ID and description are required' });
    }

    try {
        // Call RetroDiffusion API
        const rdApiKey = process.env.RETRO_DIFFUSION_API_KEY;
        if (!rdApiKey) {
            return res.status(500).json({ error: 'RetroDiffusion API key not configured' });
        }

        console.log('Generating portrait for NPC:', npcName);
        
        // First, classify the entity type using AI
        const entityType = await classifyEntityType(npcDescription);
        console.log('Entity classified as:', entityType);
        
        // Build an enhanced prompt based on entity type
        let portraitPrompt;
        if (entityType === 'non-humanoid') {
            // For non-human objects/entities, focus on the object itself without human features
            portraitPrompt = `Centered detailed depiction of ${npcDescription}, intricate details, cyberpunk aesthetic`;
            console.log('Using non-humanoid prompt');
        } else {
            // For humanoid NPCs, use portrait-focused composition
            portraitPrompt = `Close-up headshot portrait of ${npcDescription}, focused on face and head, cinematic portrait composition, detailed facial features`;
            console.log('Using humanoid portrait prompt');
        }
        
        // Add region atmosphere/background styling if provided
        if (regionDescription) {
            portraitPrompt += `, atmospheric background with thematic elements inspired by: ${regionDescription}`;
            console.log('Including region atmosphere in portrait');
        } else {
            // Generic atmospheric background when no region context
            portraitPrompt += `, atmospheric background`;
        }
        
        console.log('Portrait prompt:', portraitPrompt);
        
        // Generate square aspect ratio image (256x256 for pixel art portrait)
        const rdResponse = await fetch('https://api.retrodiffusion.ai/v1/inferences', {
            method: 'POST',
            headers: {
                'X-RD-Token': rdApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                width: 256,
                height: 256,
                prompt: portraitPrompt,
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
                    message: 'Not enough credits to generate portrait. You need 2 credits.',
                    details: errorText 
                });
            }
            
            return res.status(rdResponse.status).json({ 
                error: 'Failed to generate portrait',
                details: errorText 
            });
        }

        const rdData = await rdResponse.json();
        
        if (!rdData.base64_images || rdData.base64_images.length === 0) {
            return res.status(500).json({ error: 'No portrait generated' });
        }

        const base64Image = rdData.base64_images[0];
        
        // Initialize Supabase client with service role key for admin operations
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Supabase configuration missing' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        // Upload to Supabase Storage
        const fileName = `npc-${npcId}-${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('npc-portraits')
            .upload(fileName, imageBuffer, {
                contentType: 'image/png',
                upsert: false
            });

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            return res.status(500).json({ 
                error: 'Failed to upload portrait to storage',
                details: uploadError.message 
            });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('npc-portraits')
            .getPublicUrl(fileName);

        // Update NPC record with portrait URL
        const { error: updateError } = await supabase
            .from('npcs')
            .update({ portrait_url: publicUrl })
            .eq('id', npcId);

        if (updateError) {
            console.error('Database update error:', updateError);
            return res.status(500).json({ 
                error: 'Failed to update NPC record',
                details: updateError.message 
            });
        }

        console.log('Portrait generated and saved successfully:', publicUrl);

        return res.status(200).json({ 
            success: true,
            portraitUrl: publicUrl,
            creditsRemaining: rdData.remaining_credits
        });

    } catch (error) {
        console.error('Error generating NPC portrait:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
}

