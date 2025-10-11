import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { roomName, existingDescription, regionDescription, parentRoom, direction } = req.body;

        if (!existingDescription) {
            return res.status(400).json({ error: 'Refine requires existing description' });
        }

        const prompt = `**REFINE THIS MUD ROOM DESCRIPTION:**

Room Name: "${roomName}"

Current Description:
"${existingDescription}"

${regionDescription ? `Region Atmosphere:\n${regionDescription.substring(0, 300)}...` : ''}

Context: This room is ${direction} of "${parentRoom?.name}"

**YOUR TASK:**
Refine to exactly 50 words by:
- PRESERVING all concrete activities, functions, objects from original
  (if it says "traders", "creation terminals", "avatars" - keep those exact elements)
- ADDING vivid sensory details (what you SEE, HEAR, SMELL specifically)
- IMPROVING sentence flow and rhythm
- Making abstract concepts concrete (if any exist)

**CRITICAL - DO NOT:**
- Replace concrete activities with abstract atmosphere
- Add philosophical observations or commentary
- Change the room's core function or purpose
- Use flowery poetic language instead of specific details

**CRITICAL IMMERSION RULES:**
- NEVER mention the region name in the description (no "The Flock", "Arkyv", etc.)
- NEVER use phrases like "In this [x]", "This [x]", "Located in", "[Region]'s [x]"
- NO authorial observations like "testament to", "under the watchful eyes", "known for"
- Write in IMMEDIATE present tense - what the player SEES and EXPERIENCES right now
- Focus on PURE SENSORY details: sights, sounds, smells, textures, atmosphere
- Show, don't tell - NO commentary, just raw experience
- Avoid abstract conclusions or summaries - stay concrete and immediate

**EXAMPLES - CONCRETE vs ABSTRACT:**

Original: "a place where users primarily trade, purchase or create custom avatars"

❌ BAD REFINE:
"In this kaleidoscope of creation, avatars morph and materialize, a testament to bold imaginations and boundless expression..."
(Replaced function with abstract poetry)

✅ GOOD REFINE:
"Traders haggle over custom avatars on holographic screens. Creation terminals line walls where users craft digital forms. Credits exchange as buyers preview animated demonstrations."
(Kept function, added specific sensory HOW)

**REFINEMENT CHECKLIST:**
- ✓ All original activities/functions preserved (trading, creating, etc.)
- ✓ Sensory details are SPECIFIC (holographic screens, not "displays")
- ✓ Shows HOW activities happen (haggling, crafting, previewing)
- ✓ Exactly 50 words (count them!)
- ✓ Zero region name mentions
- ✓ Zero authorial observations
- ✓ Zero abstract replacements

Return ONLY valid JSON: {"description": "refined 50-word description"}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert MUD level designer who PRESERVES the core function and activities of rooms while adding vivid sensory details. You write concrete 50-word descriptions. You NEVER replace concrete activities with abstract atmosphere. You ALWAYS maintain the room\'s original purpose. Return only valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.6,
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        console.log('Full API response:', JSON.stringify(completion, null, 2));
        
        if (!completion.choices || completion.choices.length === 0) {
            throw new Error('No choices in API response');
        }

        const rawContent = completion.choices[0].message.content;
        console.log('Raw content:', rawContent);
        
        if (!rawContent || rawContent.trim() === '') {
            throw new Error('Empty response from API');
        }

        const result = JSON.parse(rawContent);
        const description = result.description?.substring(0, 600) || 'A newly created space.';

        return res.status(200).json({ description });

    } catch (error) {
        console.error('Room description refinement error:', error);
        return res.status(500).json({ error: 'Failed to refine room description' });
    }
}

