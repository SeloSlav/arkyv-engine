import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { roomName, roomDescription, regionName, regionDescription, npcDescription } = req.body;

        const prompt = `Generate a compelling NPC name and alias for a character in this setting.

**ROOM CONTEXT:**
Room Name: ${roomName || 'Unknown'}
Room Description: ${roomDescription || 'No description available'}

**REGION CONTEXT:**
Region: ${regionName || 'Unknown'}
${regionDescription ? `Region Description: ${regionDescription.substring(0, 300)}` : ''}

${npcDescription ? `**NPC DESCRIPTION:**
${npcDescription.substring(0, 500)}
` : ''}
**INSTRUCTIONS:**
1. The NPC name should feel appropriate for someone who would be found in this specific room
2. Consider the room's purpose, atmosphere, and the type of people who would frequent it
${npcDescription ? '3. IMPORTANT: Take into account the NPC description above - the name should reflect their described characteristics, role, or personality' : '3. The name should fit the aesthetic of the world'}
4. Generate a full name (2-3 words)
5. The alias MUST be ONE WORD from the full name - pick the most memorable or distinctive word
6. The alias should be what people would naturally call them

**EXAMPLES:**
- Name: "Reggie Riptide", Alias: "riptide" (or "reggie")
- Name: "Sarah Cross", Alias: "cross" (or "sarah")
- Name: "Marcus the Bold", Alias: "marcus" (or "bold")
- Name: "Iron Jack", Alias: "iron" (or "jack")

Return as JSON:
{
  "name": "Full NPC Name",
  "alias": "wordFromName"
}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are a creative writer specializing in character names. You create memorable NPC names that fit the setting and context. The alias must always be one word taken directly from the full name. You always return valid JSON with both a full name and an alias.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 150,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const name = result.name?.substring(0, 50) || 'Unknown NPC';
        // Ensure alias is a single word, lowercase, and clean
        const alias = (result.alias?.substring(0, 50) || 'npc')
            .toLowerCase()
            .trim()
            .split(/\s+/)[0]; // Take only the first word if multiple words returned

        return res.status(200).json({ name, alias });

    } catch (error) {
        console.error('NPC name generation error:', error);
        return res.status(500).json({ error: 'Failed to generate NPC name' });
    }
}

