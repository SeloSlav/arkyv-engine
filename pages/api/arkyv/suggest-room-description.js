import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { roomName, regionDescription, parentRoom, direction, regionRooms } = req.body;

        // Build context from existing rooms in the region
        const regionContext = regionRooms && regionRooms.length > 0
            ? regionRooms.map((room, idx) => `${idx + 1}. ${room.name}: ${room.description}`).join('\n')
            : '';

        const prompt = `**CONTEXT:**

Region Atmosphere:
${regionDescription || 'A mysterious region awaits exploration.'}

Connected From:
"${parentRoom.name}" - ${parentRoom.description}

This Room:
Name: "${roomName}"
Location: ${direction} of "${parentRoom.name}"

Other Nearby Rooms:
${regionContext}

**YOUR TASK:**
Write a 50-word description for "${roomName}" that:
1. Draws atmosphere DIRECTLY from region description
2. Logically connects ${direction} from "${parentRoom.name}"
3. Is DIFFERENT from parent & nearby rooms (no repeated elements)
4. Shows concrete activities/features, not abstract vibes
5. Exactly 50 words, 2-4 sentences max

**CRITICAL IMMERSION RULES:**
- NEVER mention the region name in the description (no "The Flock", "Arkyv", etc.)
- NEVER use phrases like "In this [x]", "This [x]", "Located in", "[Region]'s [x]"
- NO authorial observations like "testament to", "under the watchful eyes", "known for"
- Write in IMMEDIATE present tense - what the player SEES and EXPERIENCES right now
- Focus on PURE SENSORY details: sights, sounds, smells, textures, atmosphere
- Show, don't tell - NO commentary, just raw experience
- Avoid abstract conclusions or summaries - stay concrete and immediate

**WRITING STYLE:**
❌ BAD: "In this vibrant enclave of The Flock, patrons gather..."
❌ BAD: "A testament to creativity..."
✅ GOOD: "Neon lights pulse across faces. Laughter mingles with deep bass..."
✅ GOOD: "Traders haggle over holographic screens. Credits exchange hands..."

**CORE PRINCIPLE:** Describe WHAT IS (concrete), not what it represents (abstract).

**QUALITY CHECKS:**
- ✓ Shows ACTIVITY and LIFE (what's happening now)
- ✓ Sensory details are SPECIFIC (actual sounds, smells, sights)
- ✓ Exactly 50 words (count them!)
- ✓ Zero region name mentions
- ✓ Zero authorial commentary ("testament to", "known for", etc.)
- ✓ Completely different from parent room

Return ONLY valid JSON: {"description": "50-word description"}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert MUD level designer specializing in creating concise, atmospheric room descriptions (50 words). Return only valid JSON.'
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
        const description = result.description?.substring(0, 600) || 'A newly created space.';

        return res.status(200).json({ description });

    } catch (error) {
        console.error('Room description suggestion error:', error);
        return res.status(500).json({ error: 'Failed to suggest room description' });
    }
}

