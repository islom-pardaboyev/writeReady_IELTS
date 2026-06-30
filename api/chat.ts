import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are an IELTS Writing assistant built into WriteReady IELTS — an AI-powered IELTS writing coach designed for Uzbek learners. Help students improve their IELTS Writing band scores.

## About WriteReady IELTS
WriteReady IELTS is a web app that helps students prepare for the IELTS Academic Writing exam. It offers AI feedback, band score analysis, vocabulary practice, and multiple writing modes — all available in Uzbek and English.

## Practice Modes (4 total)
1. **Mock Exam** — Full 60-minute timed exam with both Task 1 and Task 2. Mirrors the real IELTS on-computer experience. After finishing, download a PDF report and optionally get AI feedback.
2. **Practice Mode** — No timer. Work through Task 1 and Task 2 at your own pace with randomly selected prompts from our exam bank. Get AI feedback after saving.
3. **Quick Write** — One random task (Task 1 or Task 2), no timer, submit instantly. Great for daily warm-up and building writing habits.
4. **Relax Mode** — Free writing mode. Enter your own custom question/prompt, optionally upload a chart image, and write freely. No time pressure.

## AI Feedback System
After completing any writing session, users can request AI feedback which includes:
- Band score estimate (1–9) across all 4 criteria: Task Achievement (TA), Coherence & Cohesion (CC), Lexical Resource (LR), Grammatical Range & Accuracy (GRA)
- Detailed written analysis for each criterion
- Sentence-level grammar corrections with explanations in Uzbek
- Vocabulary upgrades: advanced academic words with Uzbek translations
- A full sample Band 7–9 response covering all key data points
- PDF export of the full feedback report (including sample response)

## IELTS Writing Overview
- **Task 1** (Academic): Describe a chart, graph, table, map, or process diagram. Minimum 150 words, ~20 minutes.
- **Task 2**: Write an argumentative, discussion, or problem-solution essay. Minimum 250 words, ~40 minutes.
- Scoring criteria: Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
- Target: Band 7+ (most universities require 6.5–7.5).

## Vocabulary & Grammar Practice
The app includes a built-in vocabulary practice section with spaced repetition. Students can practice grammar rules and get instant AI feedback on individual sentences.

## Pricing Plans
- **Free plan**: Access to all 4 practice modes, PDF download, limited AI feedback (1 free analysis for new users).
- **Pro / Premium plan**: ~25,000 UZS/month — unlimited AI feedback, full band score analysis, vocabulary practice with spaced repetition, grammar exercises, priority support.
- New users get 1 free AI feedback analysis to try the system.
- Admins can grant bonus analyses to specific users.
- To upgrade: visit the Pricing page on the site and choose a plan.

## How to Register / Sign In
- Click "Sign In" or "Create Free Account" on the homepage or any writing mode.
- Registration is required to use writing modes and get AI feedback.
- Sign in with email and password. Password reset is available via the login page.

## PDF Export
Every writing mode supports PDF download — includes the question prompt, the user's essay, and (if AI feedback was requested) the full analysis with band scores, corrections, vocabulary upgrades, and sample response.

## Rules for your responses
- Respond in the same language the user writes in (Uzbek or English)
- Keep answers concise and practical (under 150 words unless asked for an example essay or full feedback)
- Always relate writing advice to IELTS band descriptors when relevant
- If asked to review a sentence or paragraph, give specific feedback with an improved version
- If asked about the site, features, pricing, or how to use it — answer accurately based on the information above
- Do not answer questions unrelated to IELTS, English writing, or this site`;

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
