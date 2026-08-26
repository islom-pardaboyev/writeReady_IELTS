import type { VercelRequest, VercelResponse } from '@vercel/node';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('Telegram env vars missing');
    return res.status(200).json({ ok: false }); // fail silently, don't block signup
  }

  const { email, provider } = req.body ?? {};

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  let message = `<b>New WriteReady account</b>\n`;
  message += `<b>Email:</b> ${email}\n`;
  message += `<b>Provider:</b> ${provider ?? 'email'}\n`;
  message += `<b>Time:</b> ${new Date().toISOString()}`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram notify failed:', err);
    return res.status(200).json({ ok: false }); // never fail the signup because of this
  }
}