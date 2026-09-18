import jsPDF from "jspdf";
import Logo from "/logo.png";
import { isPdfSrc, loadImageForPdf } from "@/lib/loadImageForPdf";

// The PDF a student saves from Mock Exam, Practice Mode, Relax Mode and
// Quick Write: their question, the Task 1 chart and their answer on A4, in
// the site's own colors. Every line of text is measured and placed one at a
// time, so long answers flow onto new pages instead of running off the edge.

type RGB = [number, number, number];

const INK: RGB = [15, 23, 42]; // --text-primary
const MUTED: RGB = [71, 85, 105]; // --text-secondary
const HAIRLINE: RGB = [226, 232, 240]; // --border-color
const SUBTLE: RGB = [241, 245, 249]; // --bg-subtle
const BRAND: RGB = [79, 70, 229]; // --ink-blue
const MET: RGB = [4, 120, 87]; // emerald-700
const SHORT: RGB = [180, 83, 9]; // amber-700

const PT = 0.3528; // millimetres per point
const MIN_WORDS = { 1: 150, 2: 250 } as const;

export interface EssayPdfTask {
  taskNum: 1 | 2;
  question?: string | null;
  imageSrc?: string | null;
  answer: string;
}

export interface EssayPdfOptions {
  /** The mode's name as the app shows it, e.g. "Mock Exam". */
  mode: string;
  tasks: EssayPdfTask[];
  fileName: string;
}

// Same rule the writing screens use for their live word count.
const countWords = (text: string) => {
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
  [/[\u{2022}\u{2023}\u{2043}\u{25AA}\u{25CF}]/gu, "-"],
  [/\u{20AC}/gu, "EUR"],
  [/[\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}]/gu, " "],
  [/[\u{200B}\u{200C}\u{2060}\u{FEFF}\u{AD}]/gu, ""],
  [/\u{200D}/gu, ""],
  [/\p{Variation_Selector}/gu, ""],
  [/\p{Extended_Pictographic}/gu, ""],
  [/[\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}]/gu, ""],
];

// Control characters other than the line break have no glyph at all.
const isControl = (code: number) => (code < 32 && code !== 10) || (code >= 127 && code < 160);

function pdfSafe(text: string): string {
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

interface Line {
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

// Wraps text to maxW with the font currently set on doc. Each line break the
// student typed starts a new paragraph; empty lines are dropped.
function wrap(doc: jsPDF, text: string, maxW: number): Line[] {
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

export async function downloadEssayPdf({ mode, tasks, fileName }: EssayPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const X = 20;
  const W = pageW - X * 2;
  const TOP = 26; // content start on later pages, under the running header
  const BOTTOM = pageH - 22; // content end, above the footer
  const title = pdfSafe(mode);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  doc.setProperties({ title: `${title}, WriteReady IELTS`, subject: "IELTS Writing", creator: "WriteReady IELTS" });

  const pageTask: Record<number, number> = {};
  let currentTask: number = tasks[0]?.taskNum ?? 1;
  let y = 0;

  const font = (size: number, style: "normal" | "bold" | "italic", color: RGB) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const hairline = (at: number) => {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(X, at, X + W, at);
  };
  const newPage = () => {
    doc.addPage();
    y = TOP;
    pageTask[doc.getNumberOfPages()] = currentTask;
  };
  const room = () => BOTTOM - y;
  const lineHeight = (size: number, leading: number) => size * PT * leading;

  const label = (text: string) => {
    font(9, "bold", MUTED);
    doc.text(text, X, y + 3.2);
    y += 6.5;
  };

  // Draws lines from y down with the current font, starting a new page
  // whenever the next line would cross the bottom margin. With a box, each
  // page's share of the text sits in its own tinted panel with an indigo edge.
  const flow = (
    lines: Line[],
    size: number,
    leading: number,
    paraGap: number,
    box?: { pad: number; inset: number },
  ) => {
    const em = size * PT;
    const lh = em * leading;
    const pad = box?.pad ?? 0;
    const textX = X + (box?.inset ?? 0);
    let i = 0;
    while (i < lines.length) {
      const steps: number[] = [];
      while (i + steps.length < lines.length) {
        const step = (steps.length > 0 && lines[i + steps.length].paraStart ? paraGap : 0) + lh;
        if (steps.reduce((a, b) => a + b, 0) + step + pad * 2 > room()) break;
        steps.push(step);
      }
      const left = lines.length - (i + steps.length);
      if (steps.length === 0 || (steps.length === 1 && left > 0)) {
        // Nothing fits, or only one line would sit alone at the page foot.
        if (y > TOP) {
          newPage();
          continue;
        }
        if (steps.length === 0) steps.push(lh); // a fresh page always takes a line
      } else if (left === 1 && steps.length >= 3) {
        steps.pop(); // carry two lines over rather than strand one
      }
      const count = steps.length;
      const height = steps.reduce((a, b) => a + b, 0);
      if (box) {
        doc.setFillColor(...SUBTLE);
        doc.rect(X, y, W, height + pad * 2, "F");
        doc.setFillColor(...BRAND);
        doc.rect(X, y, 1, height + pad * 2, "F");
      }
      let top = y + pad;
      for (let k = 0; k < count; k++) {
        const line = lines[i + k];
        if (k > 0 && line.paraStart) top += paraGap;
        doc.text(line.text, textX, top + (lh - em) / 2 + em * 0.8);
        top += lh;
      }
      y += height + pad * 2;
      i += count;
      if (i < lines.length) newPage();
    }
  };

  // First-page header: logo and wordmark, date, then the mode as the title.
  const logo = await loadImageForPdf(Logo, "png");
  let wordmarkX = X;
  if (logo) {
    doc.addImage(logo.data, "PNG", X, 16, 8, 8);
    wordmarkX = X + 10.5;
  }
  font(12, "bold", INK);
  doc.text("WriteReady", wordmarkX, 21.5);
  const ieltsX = wordmarkX + doc.getTextWidth("WriteReady ");
  font(12, "bold", BRAND);
  doc.text("IELTS", ieltsX, 21.5);
  font(9, "normal", MUTED);
  doc.text(date, X + W, 21.5, { align: "right" });
  hairline(30);

  font(22, "bold", INK);
  doc.text(title, X, 43.5);
  font(10.5, "normal", MUTED);
  const taskList = tasks.map((t) => `Task ${t.taskNum}`).join(" and ");
  doc.text(`IELTS Writing, ${taskList}`, X, 50.5);
  y = 60;
  pageTask[1] = currentTask;

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    currentTask = task.taskNum;
    if (index > 0) newPage();

    // Task heading with the word count against the task's minimum.
    const min = MIN_WORDS[task.taskNum];
    const words = countWords(task.answer);
    font(15, "bold", INK);
    doc.text(`Task ${task.taskNum}`, X, y + 5.4);
    const status =
      words === 0
        ? "No answer written"
        : words >= min
          ? `${words} words \u00B7 meets the ${min} minimum`
          : `${words} words \u00B7 ${min - words} below the ${min} minimum`;
    font(9.5, "bold", words === 0 ? MUTED : words >= min ? MET : SHORT);
    doc.text(status, X + W, y + 5.4, { align: "right" });
    y += 9;
    hairline(y);
    y += 7;

    const question = task.question?.trim();
    if (question) {
      font(10.5, "normal", INK);
      const lines = wrap(doc, question, W - 9);
      if (room() < 6.5 + 8 + lineHeight(10.5, 1.45) * 2) newPage();
      label("Question");
      font(10.5, "normal", INK);
      flow(lines, 10.5, 1.45, 2, { pad: 4, inset: 5 });
      y += 7;
    }

    if (task.taskNum === 1 && task.imageSrc) {
      const img = await loadImageForPdf(task.imageSrc);
      if (img) {
        let w = W;
        let h = (W * img.h) / img.w;
        const maxH = 110;
        if (h > maxH) {
          h = maxH;
          w = (h * img.w) / img.h;
        }
        if (h > room()) newPage();
        const imgX = X + (W - w) / 2;
        doc.addImage(img.data, "JPEG", imgX, y, w, h);
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.25);
        doc.rect(imgX, y, w, h, "S");
        y += h + 8;
      } else {
        font(9.5, "italic", MUTED);
        const note = isPdfSrc(task.imageSrc)
          ? "The Task 1 chart is a PDF file, so it isn't shown in this report."
          : "The Task 1 chart couldn't be loaded, so it isn't shown in this report.";
        flow(wrap(doc, note, W), 9.5, 1.4, 0);
        y += 6;
      }
    }

    font(11, "normal", INK);
    const answerLines = wrap(doc, task.answer, W);
    if (room() < 6.5 + lineHeight(11, 1.6) * 3) newPage();
    label("Your answer");
    if (answerLines.length === 0) {
      font(10.5, "italic", MUTED);
      flow(wrap(doc, "Nothing was written for this task.", W), 10.5, 1.45, 0);
    } else {
      font(11, "normal", INK);
      flow(answerLines, 11, 1.6, 2.6);
    }
  }

  // Running header on later pages and a footer on every page.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    font(8.5, "normal", MUTED);
    if (p > 1) {
      doc.text(`WriteReady IELTS \u00B7 ${title}`, X, 13);
      doc.text(`Task ${pageTask[p] ?? currentTask}`, X + W, 13, { align: "right" });
      hairline(16.5);
    }
    hairline(pageH - 15);
    font(8.5, "normal", MUTED);
    doc.text("writeready.uz", X, pageH - 9.5);
    doc.text(`Page ${p} of ${total}`, X + W, pageH - 9.5, { align: "right" });
  }

  doc.save(fileName);
}
