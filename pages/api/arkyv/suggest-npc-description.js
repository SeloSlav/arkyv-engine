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
            existingDescription, 
            roomName, 
            roomDescription, 
            regionName, 
            regionDescription 
        } = req.body;

        // Check if we're refining existing text or generating from scratch
        const isRefining = existingDescription && existingDescription.trim().length > 0;

        const prompt = isRefining
            ? `Refine this physical description while maintaining its core details.

**EXISTING DESCRIPTION (improve this):**
${existingDescription}

**NPC CONTEXT:**
Name: ${npcName || 'Unknown'}
${npcAlias ? `Alias: ${npcAlias}` : ''}

**LOCATION CONTEXT:**
Room: ${roomName || 'Unknown'}
${roomDescription ? `Room Description: ${roomDescription.substring(0, 400)}` : ''}
Region: ${regionName || 'Unknown'}
${regionDescription ? `Region Atmosphere: ${regionDescription.substring(0, 300)}` : ''}

**INSTRUCTIONS:**
1. ONE SENTENCE ONLY - no exceptions
2. PHYSICAL DESCRIPTION ONLY - appearance, clothing, build
3. NO personality, no behavior, no actions, no demeanor
4. Keep the core physical details from the existing description
5. Make it more vivid and atmospheric
6. Write in present tense, third person
7. Match the tone
8. Don't repeat the name or alias

Return as JSON:
{
  "description": "One sentence physical description"
}`
            : `Generate a physical description for this NPC.

**NPC DETAILS:**
Name: ${npcName || 'Unknown'}
${npcAlias ? `Alias: ${npcAlias}` : ''}

**LOCATION CONTEXT:**
Room: ${roomName || 'Unknown'}
${roomDescription ? `Room Description: ${roomDescription.substring(0, 400)}` : ''}
Region: ${regionName || 'Unknown'}
${regionDescription ? `Region Atmosphere: ${regionDescription.substring(0, 300)}` : ''}

**INSTRUCTIONS:**
1. ONE SENTENCE ONLY - no exceptions
2. PHYSICAL DESCRIPTION ONLY - appearance, clothing, build, visual details
3. NO personality, no behavior, no actions, no demeanor, no attitudes
4. Focus on what you can SEE: height, build, hair, eyes, clothing, scars, tattoos, accessories
5. Make them feel like they belong in this specific location through their appearance
6. Write in present tense, third person
7. Match the tone
8. Don't repeat the name or alias

**GOOD EXAMPLES (one sentence each):**
- "Tall and wiry with sharp eyes and weathered hands, dressed in a worn leather coat with numerous pockets."
- "Built like a mountain with broad shoulders and thick arms, wearing simple but well-maintained clothing."
- "Draped in flowing fabrics that catch the light, their eyes bright and alert beneath dark hair."
- "Short and compact with calloused fingers and a steady gaze, dressed practically for their work."

Return as JSON:
{
  "description": "One sentence physical description"
}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are a creative writer specializing in physical character descriptions. You write ONE SENTENCE ONLY describing what a character looks like - their appearance, clothing, and build. You NEVER describe personality, behavior, or actions. You focus purely on visual details. You always return valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const description = result.description?.substring(0, 500) || 'A mysterious figure.';

        return res.status(200).json({ description });

    } catch (error) {
        console.error('NPC description generation error:', error);
        return res.status(500).json({ error: 'Failed to generate NPC description' });
    }
}

