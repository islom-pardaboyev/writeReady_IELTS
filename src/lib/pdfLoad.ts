/**
 * The PDF builders, loaded when a student first asks for a PDF.
 *
 * jsPDF and the builders are about 130 KB gzipped. Imported directly, every
 * writing page and the dashboard downloaded them before showing anything,
 * though most visits never make a PDF. The service worker precaches the
 * chunk, so an installed app still has it offline; warmPdf() fetches it early
 * where a PDF must not wait (the Mock exam saves one when time runs out).
 */

export const loadEssayPdf = () => import("./essayPdf");
export const loadFeedbackPdf = () => import("./feedbackPdf");

/** Fetches the essay PDF builder in the background once the page is idle. */
export function warmEssayPdf(): () => void {
  const start = () => void loadEssayPdf().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(start, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(start, 2000);
  return () => window.clearTimeout(id);
}
