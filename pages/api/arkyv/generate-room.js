import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentRoom, direction, regionName, regionDescription, regionRooms } = req.body;

        // Debug logging
        console.log('=== Room Generation Request ===');
        console.log('Region Name:', regionName);
        console.log('Region Description:', regionDescription ? `${regionDescription.substring(0, 100)}...` : 'MISSING');
        console.log('Parent Room:', parentRoom.name);
        console.log('Direction:', direction);

        // Build context from existing rooms in the region
        const regionContext = regionRooms
            .map((room, idx) => `${idx + 1}. ${room.name}: ${room.description}`)
            .join('\n');

        const prompt = `**CONTEXT:**

Region Atmosphere:
${regionDescription || 'A mysterious region awaits exploration.'}

Connected From:
"${parentRoom.name}" - ${parentRoom.description}

New Room Direction: ${direction} of "${parentRoom.name}"

Other Nearby Rooms:
${regionContext}

**YOUR TASK:**
Create a NEW room (name + description) that:
1. Draws atmosphere DIRECTLY from the region description
2. Logically connects ${direction} from "${parentRoom.name}"
3. Is DIFFERENT from parent & nearby rooms (no repeated elements)
4. Offers something distinct while fitting the region
5. NAME: 2-4 words, under 30 chars, concrete and specific
6. DESCRIPTION: Exactly 50 words, 2-3 sentences max

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
❌ BAD: "A testament to creativity under watchful eyes..."
✅ GOOD: "Neon lights pulse across faces. Laughter mingles with deep bass..."
✅ GOOD: "Shadows dance along walls. Digital chimes echo overhead..."

**CORE PRINCIPLE:** Describe WHAT IS (concrete), not what it represents (abstract).

**QUALITY CHECKS:**
- ✓ Room NAME uses concrete nouns (Avatar Market, not Euphoric Chamber)
- ✓ Description shows ACTIVITY and LIFE, not just static setting
- ✓ Sensory details are SPECIFIC (what sounds, smells, sights)
- ✓ Exactly 50 words (count them!)
- ✓ Zero region name mentions
- ✓ Zero authorial commentary
- ✓ Completely different from parent room

Return ONLY valid JSON: {"name": "Room Name", "description": "50-word description"}`;

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert MUD level designer specializing in creating concise, atmospheric room descriptions. Write brief, evocative descriptions (50 words). Return only valid JSON.'
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

        // Ensure the name and description fit our limits
        const name = result.name?.substring(0, 30) || 'Generated Room';
        const description = result.description?.substring(0, 600) || 'A newly generated space.';

        return res.status(200).json({ name, description });

    } catch (error) {
        console.error('OpenAI API Error:', error);
        return res.status(500).json({ 
            error: 'Failed to generate room',
            details: error.message 
        });
    }
}

