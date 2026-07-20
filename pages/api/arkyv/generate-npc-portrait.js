import { createChatCompletion } from '@/lib/aiProvider';
import { generateImage, imageProviderErrorResponse } from '@/lib/imageProvider';

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
        
        const generated = await generateImage({
            prompt: portraitPrompt,
            width: 256,
            height: 256,
        });

        return res.status(200).json({ 
            success: true,
            portraitUrl: generated.imageUrl,
            provider: generated.provider,
            providerLabel: generated.providerLabel,
            creditsRemaining: generated.creditsRemaining,
        });

    } catch (error) {
        console.error('Error generating NPC portrait:', error);
        const response = imageProviderErrorResponse(error, 'Unable to generate NPC portrait.');
        return res.status(response.status).json(response.body);
    }
}

