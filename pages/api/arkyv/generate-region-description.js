import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { regionName, existingDescription } = req.body;

        let prompt;
        if (existingDescription && existingDescription.trim().length > 0) {
            // Enhance existing description
            const nameContext = regionName && regionName.trim().length > 0 
                ? `Region Name: ${regionName}\n` 
                : '';
            
            prompt = `${nameContext}**Current Description:** ${existingDescription}

**Task:** Enhance and expand this description while preserving its core identity.

**Requirements:**
- SINGLE PARAGRAPH ONLY (no line breaks or paragraph breaks)
- Target length: 400-500 words
- Maintain ALL core themes and key elements from existing description
- Add vivid sensory details: sights, sounds, smells, textures, atmosphere
- Enhance mood and character without changing the essence
- Make every sentence count - no filler or redundancy

**Style Guidelines:**
- Use concrete, specific details over vague atmosphere
- Show activities and movement, not just static description  
- Layer sensory experiences (what you see, hear, feel simultaneously)
- Vary sentence rhythm (mix short punchy sentences with longer flowing ones)

Return ONLY valid JSON: {"description": "enhanced description as single paragraph"}`;
        } else {
            // Generate fresh description
            if (regionName && regionName.trim().length > 0) {
                prompt = `**Region Name:** ${regionName}

**Task:** Create a vivid, immersive description that brings this region to life.

**Requirements:**
- SINGLE PARAGRAPH ONLY (no line breaks or paragraph breaks)
- Target length: 400-500 words
- Rich sensory details: sights, sounds, smells, textures, lighting, atmosphere
- Capture unique character, mood, and identity
- Show the region through concrete details and activities

**Key Questions to Answer:**
- What defines this place visually and atmospherically?
- Who comes here and what do they do?
- What's the dominant mood/vibe/energy?
- What makes it different from everywhere else?

**Style Guidelines:**
- Use specific, concrete details over vague descriptions
- Show movement and life (people doing things, not just existing)
- Layer multiple sensory experiences together
- Create vivid mental images with precise language
- Avoid clichés and generic fantasy/sci-fi tropes

Return ONLY valid JSON: {"description": "description as single paragraph"}`;
            } else {
                // No name or description - generate a generic region description
                prompt = `**Task:** Create a vivid, atmospheric description for a completely new region.

**Requirements:**
- SINGLE PARAGRAPH ONLY (no line breaks or paragraph breaks)
- Target length: 400-500 words
- Rich sensory details throughout
- Unique character and strong identity
- Concrete, specific details

**What to Include:**
- Clear visual atmosphere and setting
- Who inhabits/visits this place
- What activities and interactions occur
- Distinctive mood and energy
- Sensory layers (sights, sounds, smells, textures)

**Style Guidelines:**
- Be specific and concrete, not vague
- Show life and movement
- Avoid generic tropes
- Make it memorable and distinctive

Return ONLY valid JSON: {"description": "description as single paragraph"}`;
            }
        }

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert game writer specializing in atmospheric world-building. You create vivid, immersive single-paragraph descriptions that bring locations to life. You always return valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.85,
            max_tokens: 1000,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const description = result.description || 'A mysterious region awaits exploration.';

        // Truncate to 3500 chars max (roughly 500-600 words)
        const truncatedDescription = description.substring(0, 3500);

        return res.status(200).json({ description: truncatedDescription });

    } catch (error) {
        console.error('Description generation error:', error);
        return res.status(500).json({ error: 'Failed to generate description' });
    }
}

