import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { existingRegions } = req.body;

        const prompt = existingRegions && existingRegions.length > 0
            ? `**Existing Region Names:**
${existingRegions.map(r => r.display_name || r.name).join(', ')}

**Task:** Generate a NEW, UNIQUE region name that matches the style and aesthetic of the existing regions.

**Requirements:**
- 2-4 words maximum (under 50 characters)
- Match the tone and naming style of existing regions
- Must be COMPLETELY DIFFERENT from all existing regions
- Evocative, memorable, and atmospheric
- Use concrete nouns (places, things, phenomena) not abstract concepts
- Avoid generic names (Downtown, City Center, Main Street, etc.)

**Style Examples:**
✅ GOOD: "Neon Spine", "Baltic Squirrel", "Night Cafe", "Vaults of Zephyr"
❌ BAD: "Happy District", "Main Plaza", "Tech Zone", "Digital Area"

Return ONLY valid JSON: {"name": "Region Name"}`
            : `**Task:** Generate a unique, evocative region name.

**Requirements:**
- 2-4 words maximum (under 50 characters)
- Evocative, memorable, and atmospheric
- Use concrete nouns (places, things, phenomena) not abstract concepts
- Avoid generic names (Downtown, City Center, Main Street, etc.)

**Style Examples:**
✅ GOOD: "Neon Spine", "Baltic Squirrel", "Crimson Hollow", "Vaults of Zephyr"
❌ BAD: "Happy District", "Main Plaza", "Tech Zone", "Digital Area"

Return ONLY valid JSON: {"name": "Region Name"}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are a creative game writer specializing in evocative, concrete location names. You use specific nouns and avoid generic or abstract names. You always return valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.9,
            max_tokens: 100,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const name = result.name?.substring(0, 100) || 'New Region';

        return res.status(200).json({ name });

    } catch (error) {
        console.error('Region name generation error:', error);
        return res.status(500).json({ error: 'Failed to generate region name' });
    }
}

