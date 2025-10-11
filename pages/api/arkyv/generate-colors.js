import OpenAI from 'openai';
import { getOpenAIClientConfig, getModelForSDK } from '@/lib/aiProvider';

// IMPORTANT! Set the runtime to edge for smaller bundle size
export const runtime = 'edge';

const openai = new OpenAI(getOpenAIClientConfig());

// Cyberpunk color palette
const cyberpunkColors = [
    '#38bdf8', // cyan
    '#ec4899', // pink
    '#a855f7', // purple
    '#f472b6', // hot pink
    '#10b981', // green
    '#6366f1', // indigo
    '#fbbf24', // amber
    '#fb923c', // orange
    '#22d3ee', // cyan bright
    '#f87171', // red
    '#a78bfa', // violet
    '#34d399', // emerald
];

function generateRandomCyberpunkColor() {
    return cyberpunkColors[Math.floor(Math.random() * cyberpunkColors.length)];
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function lightenColor(hex, percent = 40) {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#e0f2fe';
    
    const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (percent / 100)));
    const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (percent / 100)));
    const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (percent / 100)));
    
    return rgbToHex(r, g, b);
}

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { mode, baseColor, regionName, regionDescription } = await req.json();

        if (mode === 'random') {
            // Generate truly random cyberpunk colors
            const borderColor = generateRandomCyberpunkColor();
            const fontColor = lightenColor(borderColor, 85);
            const rgb = hexToRgb(borderColor);
            const accent = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)` : 'rgba(56, 189, 248, 0.14)';
            
            return new Response(JSON.stringify({
                borderColor,
                fontColor,
                accent
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } else if (mode === 'suggest') {
            // AI suggest mode - analyze region to suggest colors
            const nameContext = regionName ? `Region Name: ${regionName}\n` : '';
            const descContext = regionDescription ? `Region Description: ${regionDescription}\n` : '';
            
            const prompt = `${nameContext}${descContext}
Based on this region's theme, character, and atmosphere, suggest an appropriate color scheme.

Return a JSON object with:
- borderColor: a vibrant hex color that matches the region's mood and theme
- fontColor: a light complementary hex color suitable for text (high contrast)
- accent: an rgba version of the border color with 0.14 opacity for backgrounds

Consider the region's atmosphere and pick colors that evoke the right feeling. Use cyberpunk/neon aesthetics (blues, pinks, purples, oranges, greens, cyans, etc.).`;

            const completion = await openai.chat.completions.create({
                model: getModelForSDK('fast'),
                messages: [
                    {
                        role: 'system',
                        content: 'You are a color theory expert specializing in cyberpunk aesthetics. You analyze themes and atmospheres to suggest appropriate color schemes. You always return valid JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 300,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(completion.choices[0].message.content);

            return new Response(JSON.stringify({
                borderColor: result.borderColor || '#38bdf8',
                fontColor: result.fontColor || '#e0f2fe',
                accent: result.accent || 'rgba(56, 189, 248, 0.14)'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            // complementary mode - use AI for color theory
            const prompt = `Given this base color: ${baseColor}
            
            Generate complementary colors for a cyberpunk game region color scheme.
            
            Return a JSON object with:
            - borderColor: keep this as ${baseColor} or a slightly adjusted vibrant version
            - fontColor: a light complementary color with high contrast against dark backgrounds (hex format)
            - accent: an rgba version of the borderColor with 0.14 opacity for subtle backgrounds
            
            Make sure the fontColor provides excellent readability on dark slate backgrounds (#1e293b).`;

            const completion = await openai.chat.completions.create({
                model: getModelForSDK('fast'),
                messages: [
                    {
                        role: 'system',
                        content: 'You are a color theory expert specializing in cyberpunk aesthetics and UI design. You always return valid JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.9,
                max_tokens: 300,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(completion.choices[0].message.content);

            // Validate and return
            return new Response(JSON.stringify({
                borderColor: result.borderColor || '#38bdf8',
                fontColor: result.fontColor || '#e0f2fe',
                accent: result.accent || 'rgba(56, 189, 248, 0.14)'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('Color generation error:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate colors' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

