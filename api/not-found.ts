import type { VercelRequest, VercelResponse } from '@vercel/node';

// Shown only if the app shell can't be fetched, so it has to stand on its own.
const FALLBACK = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found | WriteReady IELTS</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; font-family: system-ui, sans-serif; background: #fff; color: #0f172a; text-align: center; padding: 1.5rem; }
  h1 { font-size: 1.75rem; margin: 0; }
  p { margin: 0; color: #64748b; }
  a { color: #4f46e5; font-weight: 600; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #f5f5f5; } p { color: #a3a3a3; } }
</style>
</head>
<body>
  <h1>This page doesn't exist.</h1>
  <p>The link may be old, or the address may have a typo.</p>
  <p><a href="/">Go to WriteReady IELTS</a></p>
</body>
</html>`;

/**
 * Serves the app shell with a real 404 status for addresses that match no
 * route. Vercel sends every unknown, extension-less path here, so crawlers see
 * a 404 while the visitor still gets the app's own "page not found" screen.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host ?? '';
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const protocol = local ? 'http' : 'https';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Never cache the shell under a wrong address: a path that is a 404 today
  // may become a real page tomorrow.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'HEAD') {
    res.status(404).end();
    return;
  }

  try {
    // index.html keeps its extension, so it is served as a static file and
    // never rewritten back to this function.
    const shell = await fetch(`${protocol}://${host}/index.html`);
    if (shell.ok) {
      res.status(404).send(await shell.text());
      return;
    }
  } catch {
    // Falls through to the plain page below.
  }

  res.status(404).send(FALLBACK);
}
