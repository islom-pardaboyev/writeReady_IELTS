import jsPDF from "jspdf";
import Logo from "/logo.png";
import { loadImageForPdf } from "@/lib/loadImageForPdf";

// What the essay PDF and the feedback report PDF share: the site's colors,
// the text clean-up the built-in font needs, line wrapping, and the header
// and footer, so every PDF a student downloads looks like it belongs together.

export type RGB = [number, number, number];

export const INK: RGB = [15, 23, 42]; // --text-primary
export const MUTED: RGB = [71, 85, 105]; // --text-secondary
export const HAIRLINE: RGB = [226, 232, 240]; // --border-color
export const SUBTLE: RGB = [241, 245, 249]; // --bg-subtle
export const BRAND: RGB = [79, 70, 229]; // --ink-blue
export const MET: RGB = [4, 120, 87]; // emerald-700
export const SHORT: RGB = [180, 83, 9]; // amber-700

export const PT = 0.3528; // millimetres per point
export const MIN_WORDS = { 1: 150, 2: 250 } as const;

// Same rule the writing screens use for their live word count.
export const countWords = (text: string) => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};

// jsPDF's built-in Helvetica only has Latin-1 glyphs; anything else prints as
// garbage or nothing. Map the usual typographic characters (smart quotes from
// phone keyboards, dashes, the Uzbek o-tutuq) to plain ones, drop invisible
// ones and emoji, strip accents the font lacks, and only then fall back to "?".
const REPLACEMENTS: [RegExp, string][] = [
  [/\r\n?/g, "\n"],
  [/\t/g, "    "],
  [/[\u{2018}\u{2019}\u{201A}\u{201B}\u{2032}\u{2BB}\u{2BC}\u{2BD}]/gu, "'"],
  [/[\u{201C}\u{201D}\u{201E}\u{201F}\u{2033}]/gu, '"'],
  [/[\u{2010}-\u{2015}\u{2212}]/gu, "-"],
  [/\u{2026}/gu, "..."],
  [/[\u{2192}\u{21D2}\u{27F6}\u{279D}]/gu, "->"],
  [/[\u{2190}\u{21D0}]/gu, "<-"],
  [/\u{2248}/gu, "~"],
  [/\u{2264}/gu, "<="],
  [/\u{2265}/gu, ">="],
  [/[\u{2022}\u{2023}\u{2043}\u{25AA}\u{25CF}]/gu, "-"],
  [/\u{20AC}/gu, "EUR"],
  [/[\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}]/gu, " "],
  [/[\u{200B}\u{200C}\u{2060}\u{FEFF}\u{AD}]/gu, ""],
  [/\u{200D}/gu, ""],
  [/\p{Variation_Selector}/gu, ""],
  [/ *\p{Extended_Pictographic}/gu, ""],
  [/[\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}]/gu, ""],
];

// Control characters other than the line break have no glyph at all.
const isControl = (code: number) => (code < 32 && code !== 10) || (code >= 127 && code < 160);

export function pdfSafe(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  out = Array.from(out)
    .filter((ch) => !isControl(ch.codePointAt(0) ?? 0))
    .join("");
  return out.replace(/[^\n\x20-\x7E\xA0-\xFF]/gu, (ch) => {
    const plain = ch.normalize("NFKD").replace(/[\u{300}-\u{36F}]/gu, "");
    return /^[\x20-\x7E\xA0-\xFF]+$/.test(plain) ? plain : "?";
  });
}

export interface Line {
  text: string;
  /** First line of a paragraph after the first one. */
  paraStart: boolean;
}

// Cuts a line that is still too wide (a long URL, "aaaaaaaa...") at the
// character where it stops fitting.
function hardBreak(doc: jsPDF, line: string, maxW: number): string[] {
  if (doc.getTextWidth(line) <= maxW) return [line];
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (current && doc.getTextWidth(current + ch) > maxW) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Wraps text to width with the font currently set on doc. Each line break the
// student typed starts a new paragraph; empty lines are dropped. jsPDF
// measures with kerning but draws without it, so a full line prints up to
// about 1% wider than measured; wrapping 1.5% short keeps it inside the margin.
export function wrap(doc: jsPDF, text: string, width: number): Line[] {
  const maxW = width * 0.985;
  const lines: Line[] = [];
  const paragraphs = pdfSafe(text)
    .split("\n")
    .map((p) => p.trimEnd())
    .filter((p) => p.trim() !== "");
  paragraphs.forEach((para, i) => {
    const wrapped = (doc.splitTextToSize(para, maxW) as string[]).flatMap((l) => hardBreak(doc, l, maxW));
    wrapped.forEach((l, j) => lines.push({ text: l, paraStart: i > 0 && j === 0 }));
  });
  return lines;
}

export const setFont = (doc: jsPDF, size: number, style: "normal" | "bold" | "italic" | "bolditalic", color: RGB) => {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

export const hairline = (doc: jsPDF, x: number, w: number, at: number) => {
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.25);
  doc.line(x, at, x + w, at);
};

export const todayLong = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// First-page masthead: logo and wordmark on the left, the date on the right,
// a hairline under both at y = 30.
export async function drawMasthead(doc: jsPDF, x: number, w: number, date: string): Promise<void> {
  const logo = await loadImageForPdf(Logo, "png");
  let wordmarkX = x;
  if (logo) {
    doc.addImage(logo.data, "PNG", x, 16, 8, 8, "masthead-logo", "FAST");
    wordmarkX = x + 10.5;
  }
  setFont(doc, 12, "bold", INK);
  doc.text("WriteReady", wordmarkX, 21.5);
  const ieltsX = wordmarkX + doc.getTextWidth("WriteReady ");
  setFont(doc, 12, "bold", BRAND);
  doc.text("IELTS", ieltsX, 21.5);
  setFont(doc, 9, "normal", MUTED);
  doc.text(date, x + w, 21.5, { align: "right" });
  hairline(doc, x, w, 30);
}

// A running header on every page after the first and a footer on all of
// them. Call once, after the last page is laid out.
export function drawPageChrome(
  doc: jsPDF,
  x: number,
  w: number,
  headerLeft: string,
  headerRight: (page: number) => string,
): void {
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setFont(doc, 8.5, "normal", MUTED);
    if (p > 1) {
      doc.text(headerLeft, x, 13);
      doc.text(headerRight(p), x + w, 13, { align: "right" });
      hairline(doc, x, w, 16.5);
    }
    hairline(doc, x, w, pageH - 15);
    setFont(doc, 8.5, "normal", MUTED);
    doc.text("writeready.uz", x, pageH - 9.5);
    doc.text(`Page ${p} of ${total}`, x + w, pageH - 9.5, { align: "right" });
  }
}
