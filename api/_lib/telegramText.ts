/**
 * Posts the admin sends to every bot student (api/_lib/broadcast.ts), written
 * with two marks: **bold** and _italic_. Shared with the admin panel
 * (src/pages/writing/admin/TelegramBotSection.tsx), so its preview shows
 * exactly what Telegram will. No Node imports: the browser loads this file.
 */

/** Telegram's limits: a message's text, and a photo's caption. Counted as the student sees it. */
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;
export const BUTTON_TEXT_LIMIT = 40;

const BOLD = /\*\*([^*\n]+?)\*\*/g;
const ITALIC = /(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g;

/** The post as Telegram HTML: everything escaped, then the marks turned into tags. */
export function postToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(BOLD, '<b>$1</b>')
    .replace(ITALIC, '$1<i>$2</i>');
}

/** How long the post is once the marks are gone, which is what Telegram's limits count. */
export function postLength(text: string): number {
  return text.replace(BOLD, '$1').replace(ITALIC, '$1$2').length;
}

export interface PostButton {
  text: string;
  url: string;
}

export interface PostDraft {
  text: string;
  button?: PostButton | null;
  hasPhoto: boolean;
}

/** What is wrong with a post before it is sent, or null. The server checks again. */
export function postProblem({ text, button, hasPhoto }: PostDraft): string | null {
  const length = postLength(text.trim());
  if (!length && !hasPhoto) return 'Write the post, or add a picture.';
  const limit = hasPhoto ? CAPTION_LIMIT : TEXT_LIMIT;
  if (length > limit) {
    return hasPhoto
      ? `With a picture, Telegram allows ${CAPTION_LIMIT} characters. This post has ${length}.`
      : `Telegram allows ${TEXT_LIMIT} characters. This post has ${length}.`;
  }
  if (button) {
    const label = button.text.trim();
    const url = button.url.trim();
    if (!label && !url) return null;
    if (!label || !url) return 'A button needs both its text and its link.';
    if (label.length > BUTTON_TEXT_LIMIT) return `Keep the button text under ${BUTTON_TEXT_LIMIT} characters.`;
    if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(url)) return 'The button link must be a full address starting with https://';
  }
  return null;
}
