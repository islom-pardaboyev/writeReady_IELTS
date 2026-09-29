/**
 * Cleans blog HTML before BlogPostPage puts it on the page.
 *
 * A post is written in the admin panel's editor (TipTap) and stored as HTML,
 * and the page used to insert that HTML as it was. Only the admin can write a
 * post, so this only mattered if the admin login was ever stolen: a script in a
 * post would then run for every reader and could take over their sessions. The
 * page now trusts nothing that is stored.
 *
 * How it works: the HTML is parsed into an inert document (DOMParser: nothing
 * in it runs and no picture loads), then a NEW tree is built from it, copying
 * only what is on the lists below. Anything else is dropped, or unwrapped so
 * its text stays. Nothing from the source is ever copied as it is.
 *
 * The lists are what the editor can produce (src/components/ui/RichEditor.tsx:
 * StarterKit, text alignment and tables), plus links and pictures for older
 * posts. Adding a tool to the editor may mean adding its tag or attribute here.
 */

const TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
  'code', 'pre', 'kbd', 'blockquote', 'q', 'cite',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'span', 'div', 'section', 'article',
]);

/** Removed with everything inside them, not unwrapped. */
const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'template',
  'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'title',
  'head', 'audio', 'video', 'source', 'track', 'canvas', 'dialog', 'portal', 'xmp', 'plaintext',
]);

/** Where the editor writes `style="text-align: center"`. Nothing else is allowed in a style. */
const ALIGNABLE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'li', 'td', 'th', 'blockquote']);
const ALIGN = /^\s*text-align\s*:\s*(left|right|center|justify)\s*;?\s*$/i;

const MAX_DEPTH = 40;
const DIGITS = /^\d{1,4}$/;

/** Spaces, control and invisible characters a browser ignores inside a scheme ("java\tscript:"). */
// Matching control characters is the point of this pattern.
// oxlint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]+/g;

/**
 * The link as it may be kept, or null. Web addresses, mail and phone links,
 * an address on this site, and a #fragment. Never `javascript:`, `data:` or a
 * `//host` that would leave the site while looking local.
 */
export function safeHref(value: string): string | null {
  const compact = value.replace(INVISIBLE, '');
  if (/^(https?:|mailto:|tel:)/i.test(compact)) return value.trim();
  if (compact.startsWith('#')) return value.trim();
  if (compact.startsWith('/') && !/^\/[/\\]/.test(compact)) return value.trim();
  return null;
}

/** A picture address: https, or an address on this site. */
function safeSrc(value: string): string | null {
  const compact = value.replace(INVISIBLE, '');
  if (/^https?:/i.test(compact)) return value.trim();
  if (compact.startsWith('/') && !/^\/[/\\]/.test(compact)) return value.trim();
  return null;
}

function copyAttributes(from: Element, to: Element, tag: string): void {
  for (const attr of Array.from(from.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name === 'style') {
      const m = ALIGNABLE.has(tag) ? ALIGN.exec(value) : null;
      if (m) to.setAttribute('style', `text-align: ${m[1].toLowerCase()}`);
      continue;
    }
    if (tag === 'a') {
      if (name === 'href') {
        const href = safeHref(value);
        if (href) to.setAttribute('href', href);
      } else if (name === 'title') {
        to.setAttribute('title', value.slice(0, 200));
      }
    } else if (tag === 'img') {
      if (name === 'src') {
        const src = safeSrc(value);
        if (src) to.setAttribute('src', src);
      } else if (name === 'alt' || name === 'title') {
        to.setAttribute(name, value.slice(0, 300));
      } else if ((name === 'width' || name === 'height') && DIGITS.test(value)) {
        to.setAttribute(name, value);
      }
    } else if (tag === 'td' || tag === 'th') {
      if ((name === 'colspan' || name === 'rowspan') && DIGITS.test(value)) to.setAttribute(name, value);
      else if (name === 'colwidth' && /^\d{1,4}(,\d{1,4})*$/.test(value)) to.setAttribute(name, value);
    } else if (tag === 'ol') {
      if (name === 'start' && /^-?\d{1,6}$/.test(value)) to.setAttribute('start', value);
    } else if (tag === 'code') {
      if (name === 'class' && /^language-[\w-]{1,30}$/.test(value)) to.setAttribute('class', value);
    }
  }

  if (tag === 'a' && to.hasAttribute('href')) {
    // A link that opens a new tab must not be able to steer the page that opened it.
    to.setAttribute('rel', 'noopener noreferrer');
    if (from.getAttribute('target') === '_blank') to.setAttribute('target', '_blank');
  }
}

function copyChildren(from: Node, to: Node, doc: Document, depth: number): void {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === 3) {
      to.appendChild(doc.createTextNode(child.nodeValue ?? ''));
      continue;
    }
    if (child.nodeType !== 1) continue; // comments, processing instructions
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag) || depth >= MAX_DEPTH) continue;
    if (!TAGS.has(tag)) {
      // Not on the list: keep what is written inside it, not the element.
      copyChildren(el, to, doc, depth + 1);
      continue;
    }
    // Made by the inert document, so a picture does not start loading here.
    const copy = doc.createElement(tag);
    copyAttributes(el, copy, tag);
    copyChildren(el, copy, doc, depth + 1);
    to.appendChild(copy);
  }
}

/** The HTML with only the allowed tags and attributes left. Empty where there is no DOM to clean it with. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const box = parsed.createElement('div');
  copyChildren(parsed.body, box, parsed, 0);
  return box.innerHTML;
}
