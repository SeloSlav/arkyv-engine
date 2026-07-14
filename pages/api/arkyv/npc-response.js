import { createChatCompletion } from '@/lib/aiProvider';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { npcName, npcDescription, personality, playerMessage, conversationHistory } = req.body || {};
  if (!npcName || !playerMessage) return res.status(400).json({ error: 'NPC name and player message are required' });

  try {
    const messages = [
      {
        role: 'system',
        content: `${personality || `You are ${npcName}. ${npcDescription || 'You are a character in this location.'}`}\n\nStay in character, respond naturally, and keep the response concise. Do not include a speaker label.`,
      },
      ...(Array.isArray(conversationHistory) ? conversationHistory.slice(-12) : []),
      { role: 'user', content: playerMessage },
    ];
    const completion = await createChatCompletion({ messages, modelType: 'fast', maxTokens: 500, temperature: 0.8 });
    const response = completion?.choices?.[0]?.message?.content?.trim();
    return res.status(200).json({ response: response || '*nods without speaking*' });
  } catch (error) {
    console.error('NPC response generation failed:', error);
    return res.status(500).json({ error: error.message || 'NPC response generation failed' });
  }
}
