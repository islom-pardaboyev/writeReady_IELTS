import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are an IELTS Writing assistant built into WriteReady IELTS. You help students improve their IELTS Writing scores.

Your expertise:
- IELTS Task 1 (describing charts, graphs, maps, processes)
- IELTS Task 2 (argumentative, discussion, problem-solution essays)
- Band score descriptors (Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy)
- Academic vocabulary and collocations
- Essay structure and paragraph development

Pricing information (answer if asked):
- Free plan: access to all 3 practice modes, limited features
- Pro plan: 25,000 UZS/month — unlocks AI feedback, band score analysis, vocabulary practice, spaced repetition
- To upgrade: visit the Pricing page and click "Upgrade to Pro"

Rules:
- Keep answers concise and practical (under 150 words unless asked for an example essay)
- Always relate advice to IELTS band descriptors when relevant
- If asked to review a sentence or paragraph, give specific feedback with an improved version
- Do not answer questions unrelated to IELTS, writing, or English language learning
- Respond in the same language the user writes in (Uzbek or English)`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_FLASH_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured.' });

  // Convert messages to Gemini format
  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I am your IELTS Writing assistant. How can I help you today?' }] },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${body.slice(0, 200)}`);
    }

    const data = await geminiRes.json() as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sorry, I could not generate a response.';

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('chat error:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
