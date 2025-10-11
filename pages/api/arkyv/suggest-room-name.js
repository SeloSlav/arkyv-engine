import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

const openai = new OpenAI(getOpenAIClientConfig());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { regionName, regionDescription, nearbyRooms, parentRoom, direction, roomDescription } = req.body;

        // Check if we have a real room description to work with
        const hasRoomDescription = roomDescription && roomDescription.trim() && roomDescription !== 'A newly created space waiting to be described.';

        // Only include nearby rooms if we DON'T have a description (avoid contamination)
        const nearbyContext = !hasRoomDescription && nearbyRooms && nearbyRooms.length > 0
            ? `\n\nNearby rooms for reference:\n${nearbyRooms.map((r, i) => `${i + 1}. ${r.name}`).join('\n')}`
            : '';

        const prompt = hasRoomDescription 
            ? `Generate a CREATIVE and EVOCATIVE room name based on the description below. The name should be lore-rich and atmospheric, something that sounds like it has history and character.

**ROOM DESCRIPTION:**
${roomDescription}

**NAMING PHILOSOPHY:**

1. FIRST, identify the PRIMARY TYPE of space:
   - Is it a tavern, inn, forge, chamber, shop, hall, etc.?
   - This should be the CORE of your name
   - Example: If it's described as "a tavern", the name should clearly be a tavern name

2. Then, add ATMOSPHERIC and EVOCATIVE elements:
   - What's the unique atmosphere or setting?
   - What metaphor or imagery captures the mood?
   - What would locals or adventurers call it?
   - Use poetic, evocative language

3. Be IMAGINATIVE with your word choices:
   - Create names that sound like they belong in a story
   - Think about nicknames, local lore, or romantic titles
   - Combine unexpected but thematic words

4. Length: 2-5 words, under 40 characters

**EXCELLENT EXAMPLES:**

Description: "A bustling TAVERN... merchants... desert rags... spiced meats... void creatures whisper..."
TYPE: Tavern/Inn
✓ "Tavern of Whispering Sands" (includes "tavern")
✓ "The Spiced Mug" (tavern nickname)
✓ "The Drifting Cup" (tavern nickname with "cup")
✓ "The Sandglass Inn" (includes "inn")
✗ "The Mirage Bazaar" - NO! This sounds like a market, not a tavern!

Description: "A CHAMBER with colorful hookahs... sweet smoke... dim lighting..."
TYPE: Chamber/Lounge
✓ "The Velvet Vapor" 
✓ "Chamber of Seven Smokes" (includes "chamber")
✓ "Silk Haze Lounge" (includes "lounge")

Description: "A FORGE burns... weapons line walls... sparks fly..."
TYPE: Forge/Smithy
✓ "The Anvil's Echo" (anvil = forge tool)
✓ "Forge of Fallen Stars" (includes "forge")
✓ "Crimson Smithy" (includes "smithy")

**CRITICAL RULE:**
The name MUST match the TYPE of space described. A tavern needs a tavern-appropriate name (with words like Tavern, Inn, Mug, Cup, etc. or clear tavern context).

**AVOID:**
✗ Names that don't match the space type (calling a tavern a "bazaar")
✗ Plain descriptive names: "Bazaar Tavern", "Hookah Room"
✗ Generic combinations without atmosphere
✗ Names longer than 5 words

Create a name that feels like it belongs in an epic fantasy or cyberpunk story. Make it memorable and atmospheric.

Return JSON:
{
  "name": "Room Name"
}`
            : `Generate a creative room name for this location:

Region: ${regionName}
${regionDescription ? `Atmosphere: ${regionDescription.substring(0, 300)}` : ''}
Connected from: ${parentRoom?.name || 'Unknown'} (${direction})
${nearbyContext}

Create a 2-4 word evocative name (under 30 characters).

Return as JSON:
{
  "name": "Room Name"
}`;

        const systemMessage = hasRoomDescription
            ? 'You are a master worldbuilder and creative writer specializing in evocative location names. Your names should sound like they belong in an epic fantasy, cyberpunk, or sci-fi story - something that has lore, history, and character. Think like a poet or storyteller, not a labeler. Use metaphor, atmosphere, and imagination. Create names that adventurers would remember and locals would use. Be bold and creative. Return valid JSON only.'
            : 'You are a creative room naming assistant. Generate evocative, atmospheric names that fit the region aesthetic and context. Be creative and use the region style to inspire the name. Return valid JSON only.';

        const messages = hasRoomDescription 
            ? [
                {
                    role: 'system',
                    content: systemMessage
                },
                {
                    role: 'user',
                    content: 'Generate a creative, evocative room name for:\n\n"Colorful hookahs cluster on low tables, their intricate designs glinting under dim lighting. Sweet, spiced aromas mingle with thick smoke."\n\nReturn JSON:'
                },
                {
                    role: 'assistant',
                    content: '{"name": "The Velvet Vapor"}'
                },
                {
                    role: 'user',
                    content: 'Generate a creative, evocative room name for:\n\n"A forge burns hot with white flame. Weapons line the stone walls, their edges glinting red in the heat. Sparks dance through the acrid air."\n\nReturn JSON:'
                },
                {
                    role: 'assistant',
                    content: '{"name": "The Anvil\'s Echo"}'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
            : [
                {
                    role: 'system',
                    content: systemMessage
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

        const completion = await openai.chat.completions.create({
            model: getModelForSDK('fast'),
            messages: messages,
            temperature: hasRoomDescription ? 0.9 : 0.7,  // High temp for creativity
            max_tokens: 100,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const name = result.name?.substring(0, 30) || 'New Room';

        return res.status(200).json({ name });

    } catch (error) {
        console.error('Room name generation error:', error);
        return res.status(500).json({ error: 'Failed to generate room name' });
    }
}

