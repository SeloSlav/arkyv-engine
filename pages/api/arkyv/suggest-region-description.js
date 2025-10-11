import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { regionName, existingRegions } = req.body;

        if (!regionName) {
            return res.status(400).json({ error: 'Region name is required' });
        }

        // Format existing regions for context
        let regionContext = '';
        if (existingRegions && existingRegions.length > 0) {
            regionContext = existingRegions
                .filter(r => r.description && r.description.trim().length > 0)
                .slice(0, 5) // Use top 5 most recent regions
                .map(r => `${r.display_name || r.name}: ${r.description}`)
                .join('\n\n');
        }

        const prompt = regionContext 
            ? `**New Region Name:** ${regionName}

**Existing Region Descriptions (for style reference):**
${regionContext}

**Task:** Write a NEW description for "${regionName}" that matches the style, tone, and quality of the examples.

**Requirements:**
- SINGLE PARAGRAPH ONLY (no line breaks or paragraph breaks)
- Target length: 400-500 words (match example lengths)
- Match writing style, tone, and quality of examples
- Must be completely UNIQUE - different theme and content
- Rich sensory details: sights, sounds, smells, textures, atmosphere
- Concrete specifics, not vague generalities

**Key Priorities:**
1. Study the examples' STYLE (how they write, not what they describe)
2. Make "${regionName}" feel distinctly different from all examples
3. Show life and activity, not just static scenery
4. Layer multiple sensory experiences
5. Create strong, unique identity

Return ONLY valid JSON: {"description": "description as single paragraph"}`
            : `**New Region Name:** ${regionName}

**Task:** Write an atmospheric description that brings this region to life.

**Requirements:**
- SINGLE PARAGRAPH ONLY (no line breaks or paragraph breaks)
- Target length: 400-500 words
- Rich sensory details throughout
- Unique character and strong identity
- Show activities and life, not just setting
- Concrete, specific imagery

**Key Questions:**
- What makes this region visually distinctive?
- Who comes here and why?
- What's the dominant atmosphere/mood?
- What activities and interactions occur?
- What sensory experiences define it?

Return ONLY valid JSON: {"description": "description as single paragraph"}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert game writer specializing in atmospheric world-building. You create vivid, immersive single-paragraph descriptions that bring locations to life while maintaining consistency with existing content. You always return valid JSON.'
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
        console.error('Description suggestion error:', error);
        return res.status(500).json({ error: 'Failed to suggest description' });
    }
}

