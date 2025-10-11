// IMPORTANT! Set the runtime to edge for smaller bundle size
export const runtime = 'edge';

export default async function handler(req) {
    if (req.method === 'POST') {
        const { text } = req.body;

        const voiceId = "rVVQxT3ZuiGUZCDK48Dc";
        const modelId = "eleven_monolingual_v1";
        const apiURL = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: modelId,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0,
                    use_speaker_boost: true
                }
            })
        };

        try {
            const elevenLabsResponse = await fetch(apiURL, options);

            if (!elevenLabsResponse.ok) {
                const errorResponse = await elevenLabsResponse.text();
                return new Response(JSON.stringify({ error: 'Failed from ElevenLabs API', details: errorResponse }), {
                    status: elevenLabsResponse.status,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const contentType = elevenLabsResponse.headers.get("Content-Type");
            if (contentType && (contentType.includes("application/json") || contentType.includes("audio/mpeg"))) {
                if (contentType.includes("application/json")) {
                    const data = await elevenLabsResponse.json();
                    if (data.url) {
                        return new Response(JSON.stringify({ audioUrl: data.url }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    } else {
                        return new Response(JSON.stringify({ error: 'Invalid response from ElevenLabs API', details: data }), {
                            status: 500,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                } else {
                    const arrayBuffer = await elevenLabsResponse.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64String = buffer.toString('base64');
                    const base64Url = `data:audio/mpeg;base64,${base64String}`;
                    return new Response(JSON.stringify({ audioUrl: base64Url }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } else {
                const rawResponse = await elevenLabsResponse.text();
                return new Response(JSON.stringify({ error: 'Unexpected response type', details: rawResponse }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

        } catch (error) {
            return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } else {
        return new Response(`Method ${req.method} Not Allowed`, {
            status: 405,
            headers: { 'Allow': 'POST' }
        });
    }
}