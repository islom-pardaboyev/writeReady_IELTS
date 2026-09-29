/**
 * Posts the admin sends to every bot student (api/_lib/broadcast.ts), written
 * with two marks, **bold** and _italic_, and one tag: {name}, which becomes
 * each student's Telegram first name as the post goes out. Shared with the admin panel
 * (src/pages/writing/admin/TelegramBotSection.tsx), so its preview shows
 * exactly what Telegram will. No Node imports: the browser loads this file.
 */

/** Telegram's limits: a message's text, and a photo's caption. Counted as the student sees it. */
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;
export const BUTTON_TEXT_LIMIT = 40;

/** Where each student's first name goes (withName). */
export const NAME_TAG = '{name}';
/**
 * A first name is cut to this many characters, and the tag counts as this
 * many towards the limits, so a long name never pushes a post past them.
 */
export const NAME_ROOM = 32;

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

/**
 * How long the post is once the marks are gone, which is what Telegram's
 * limits count. Each {name} counts as the longest name it can become.
 */
export function postLength(text: string): number {
  const plain = text.replace(BOLD, '$1').replace(ITALIC, '$1$2');
  const names = plain.split(NAME_TAG).length - 1;
  return plain.length + names * (NAME_ROOM - NAME_TAG.length);
}

/** Up to NAME_ROOM characters, never splitting a character in two. */
function clipName(name: string): string {
  let out = '';
  for (const ch of name) {
    if (out.length + ch.length > NAME_ROOM) break;
    out += ch;
  }
  return out;
}

/**
 * The post's HTML (postToHtml) for one student: every {name} becomes their
 * first name. Without a name the tag goes, with the comma or space before it,
 * so "Hey, {name}!" reads "Hey!" and "{name}, look" reads "look".
 */
export function withName(html: string, firstName: string | null | undefined): string {
  if (!html.includes(NAME_TAG)) return html;
  const name = clipName((firstName ?? '').trim());
  if (!name) {
    return html
      .replace(/(^|\n)\{name\}[ \t]*,?[ \t]*/g, '$1')
      .replace(/[ \t]*,?[ \t]*\{name\}/g, '');
  }
  const safe = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.split(NAME_TAG).join(safe);
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
