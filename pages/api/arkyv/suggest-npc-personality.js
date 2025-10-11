import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { 
            npcName, 
            npcAlias,
            npcDescription,
            existingPersonality,
            roomName, 
            roomDescription, 
            regionName, 
            regionDescription 
        } = req.body;

        // Check if we're refining existing text or generating from scratch
        const isRefining = existingPersonality && existingPersonality.trim().length > 0;

        const prompt = isRefining
            ? `Refine this NPC personality prompt while maintaining its core character and approximate length.

**EXISTING PERSONALITY PROMPT (improve this):**
${existingPersonality}

**NPC DETAILS:**
Name: ${npcName || 'Unknown'}
Alias: ${npcAlias || ''}
Physical Description: ${npcDescription || ''}

**LOCATION CONTEXT:**
Room: ${roomName || 'Unknown'}
${roomDescription ? `Room Description: ${roomDescription.substring(0, 400)}` : ''}
Region: ${regionName || 'Unknown'}
${regionDescription ? `Region Atmosphere: ${regionDescription.substring(0, 300)}` : ''}

**INSTRUCTIONS:**
1. This is a system prompt that will guide the NPC's conversation behavior
2. Start with "You are [Name]..."
3. KEEP THE SAME APPROXIMATE LENGTH as the input - don't significantly expand or shrink it
4. Keep ALL core personality traits and details from the existing prompt
5. Improve clarity, flow, and specificity without removing user-provided details
6. Enhance the speaking style and behavioral descriptions
7. Keep it focused and practical for dialogue generation

Return as JSON:
{
  "personality": "Refined personality system prompt"
}`
            : `Generate a personality system prompt for this NPC that will guide their dialogue.

**NPC DETAILS:**
Name: ${npcName || 'Unknown'}
Alias: ${npcAlias || ''}
Physical Description: ${npcDescription || ''}

**LOCATION CONTEXT:**
Room: ${roomName || 'Unknown'}
${roomDescription ? `Room Description: ${roomDescription.substring(0, 400)}` : ''}
Region: ${regionName || 'Unknown'}
${regionDescription ? `Region Atmosphere: ${regionDescription.substring(0, 300)}` : ''}

**INSTRUCTIONS:**
1. This is a system prompt that will guide the NPC's conversation behavior with players
2. Start with "You are ${npcName || 'this character'}..."
3. Define their personality traits, values, and motivations
4. Describe their speaking style (formal/casual, verbose/terse, etc.)
5. Include mannerisms, catchphrases, or quirks
6. Explain their role in this location and how they interact with visitors
7. Make them feel like they belong in this specific setting
8. Keep it practical and focused for dialogue generation
9. TARGET LENGTH: 150-200 words (approximately 2-3 paragraphs)

**GOOD EXAMPLE (approx 150 words):**
"You are Marcus, a grizzled information broker who's seen it all. You speak in short, clipped sentences and rarely waste words. Your tone is world-weary but not unkind - you've learned that information flows better when people trust you. You have a habit of pausing mid-sentence to assess whether someone is being truthful. You operate out of this dimly lit corner because you value discretion above all else. When greeting newcomers, you're cautious but professional. You never volunteer information for free, but you're fair in your dealings."

Return as JSON:
{
  "personality": "Personality system prompt starting with 'You are...' (150-200 words)"
}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are a creative writer specializing in NPC personality prompts for dialogue systems. You create detailed system prompts that define how an NPC should speak and behave in conversations. Your prompts start with "You are [Name]..." and provide clear guidance for consistent character portrayal. For new suggestions, you write 150-200 words. For refinements, you maintain the approximate length of the input. You always return valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 500,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const personality = result.personality || '';

        return res.status(200).json({ personality });

    } catch (error) {
        console.error('NPC personality generation error:', error);
        return res.status(500).json({ error: 'Failed to generate NPC personality' });
    }
}

