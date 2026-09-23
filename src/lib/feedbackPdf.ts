import jsPDF from "jspdf";
import type { CategoryFeedback, EnhancedFeedbackResult, SentenceIssueType } from "@/types";
import { isPdfSrc, loadImageForPdf } from "@/lib/loadImageForPdf";
// The same official band names the feedback page shows.
import { bandLabel } from "@shared/bandScore";
import {
  BRAND,
  countWords,
  drawMasthead,
  drawPageChrome,
  HAIRLINE,
  hairline as rule,
  INK,
  type Line,
  MET,
  MIN_WORDS,
  MUTED,
  pdfSafe,
  PT,
  type RGB,
  SHORT,
  SUBTLE,
  setFont,
  todayLong,
  wrap,
} from "@/lib/pdfShared";

// The AI feedback report a student downloads from the feedback page. Page 1
// answers "how did I do?" (the band, the four criteria, what's inside), then
// the sections run from most to least actionable: what to fix first, how to
// reach the next band, each criterion, the essay, sentence by sentence
// corrections, vocabulary, grammar and a model answer. Same colors, header and
// footer as the essay PDF. Every block is measured before it is drawn, so
// cards never split across a page and long text flows line by line.

export interface FeedbackPdfOptions {
  feedback: EnhancedFeedbackResult;
  taskNum: 1 | 2;
  question?: string | null;
  imageSrc?: string | null;
  essay: string;
  fileName: string;
}

type Style = "normal" | "bold" | "italic" | "bolditalic";

const BODY: RGB = [51, 65, 85]; // slate-700, text under a heading
const STRONG: RGB = [217, 119, 6]; // amber-600, band 7+ (the page's gold)
const WEAK: RGB = [225, 29, 72]; // rose-600, below band 6
const ISSUE: RGB = [185, 28, 28]; // red-700
const GOOD: RGB = [22, 163, 74]; // green-600
const MINT: RGB = [236, 253, 245]; // emerald-50
const WHITE: RGB = [255, 255, 255];

// Same thresholds and colors as the scores on the feedback page.
const scoreColor = (s: number): RGB => (s >= 7 ? STRONG : s >= 6 ? BRAND : WEAK);

type CriterionKey = keyof EnhancedFeedbackResult["feedback"];
const CRITERIA: { key: CriterionKey; name: string; about: string }[] = [
  { key: "taskAchievement", name: "Task Achievement", about: "How fully and directly you answer the question." },
  { key: "coherenceCohesion", name: "Coherence & Cohesion", about: "How clearly your ideas are organised and linked." },
  { key: "lexicalResource", name: "Lexical Resource", about: "The range and accuracy of your vocabulary." },
  {
    key: "grammaticalRangeAccuracy",
    name: "Grammatical Range & Accuracy",
    about: "The range and accuracy of your grammar and punctuation.",
  },
];

const SENTENCE_TYPES: Record<SentenceIssueType, { label: string; fg: RGB; bg: RGB }> = {
  word_choice: { label: "Word choice", fg: [109, 40, 217], bg: [237, 233, 254] },
  grammar: { label: "Grammar", fg: [146, 64, 14], bg: [254, 243, 199] },
  coherence: { label: "Coherence", fg: [30, 64, 175], bg: [219, 234, 254] },
  structure: { label: "Structure", fg: [185, 28, 28], bg: [254, 226, 226] },
  ok: { label: "Good", fg: [22, 101, 52], bg: [220, 252, 231] },
};

// The page's order for priority fixes: red, amber, then green.
const PRIORITY: { label: string; color: RGB }[] = [
  { label: "HIGH PRIORITY", color: ISSUE },
  { label: "MEDIUM PRIORITY", color: STRONG },
  { label: "ALSO CONSIDER", color: GOOD },
];

const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";
const band = (s: number | undefined) => (typeof s === "number" && Number.isFinite(s) ? s : null);

// A measured piece of a card: wrapped text, a gap, a custom drawing of known
// height, or a tinted panel holding more blocks.
type Block =
  | {
      kind: "text";
      lines: Line[];
      size: number;
      style: Style;
      color: RGB;
      x: number;
      leading: number;
      paraGap: number;
      before: number;
    }
  | { kind: "space"; h: number }
  | { kind: "draw"; h: number; draw: (top: number) => void }
  | { kind: "panel"; fill: RGB; edge?: RGB; x: number; w: number; pad: number; before: number; blocks: Block[] };

export async function downloadFeedbackPdf({
  feedback,
  taskNum,
  question,
  imageSrc,
  essay,
  fileName,
}: FeedbackPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const X = 20;
  const W = pageW - X * 2;
  const TOP = 26; // content start on later pages, under the running header
  const BOTTOM = pageH - 22; // content end, above the footer
  let y = 0;

  doc.setProperties({
    title: `AI Feedback Report, Task ${taskNum}, WriteReady IELTS`,
    subject: "IELTS Writing feedback",
    creator: "WriteReady IELTS",
  });

  const font = (size: number, style: Style, color: RGB) => setFont(doc, size, style, color);
  const hairline = (at: number, x = X, w = W) => rule(doc, x, w, at);
  const lineH = (size: number, leading: number) => size * PT * leading;
  const baseline = (top: number, size: number, leading: number) => {
    const em = size * PT;
    return top + (em * leading - em) / 2 + em * 0.8;
  };

  // ── Page bookkeeping ────────────────────────────────────────────────────
  const pageSection: Record<number, string> = {};
  let currentSection = "Overview";
  const newPage = () => {
    doc.addPage();
    y = TOP;
    pageSection[doc.getNumberOfPages()] = currentSection;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM && y > TOP) newPage();
  };

  // ── Measuring and drawing blocks ────────────────────────────────────────
  const text = (
    str: string,
    size: number,
    style: Style,
    color: RGB,
    x: number,
    w: number,
    opts: { leading?: number; paraGap?: number; before?: number } = {},
  ): Block => {
    font(size, style, color);
    return {
      kind: "text",
      lines: wrap(doc, str, w),
      size,
      style,
      color,
      x,
      leading: opts.leading ?? 1.45,
      paraGap: opts.paraGap ?? 1.6,
      before: opts.before ?? 0,
    };
  };

  const heightOf = (b: Block): number => {
    switch (b.kind) {
      case "text": {
        const lh = lineH(b.size, b.leading);
        return b.before + b.lines.reduce((h, l, i) => h + lh + (i > 0 && l.paraStart ? b.paraGap : 0), 0);
      }
      case "space":
      case "draw":
        return b.h;
      case "panel":
        return b.before + b.pad * 2 + b.blocks.reduce((h, c) => h + heightOf(c), 0);
    }
  };
  const heightOfAll = (blocks: Block[]) => blocks.reduce((h, b) => h + heightOf(b), 0);

  // Draws a block whose top is at `top` without any page checks.
  const render = (b: Block, top: number): number => {
    switch (b.kind) {
      case "text": {
        font(b.size, b.style, b.color);
        const lh = lineH(b.size, b.leading);
        let t = top + b.before;
        b.lines.forEach((l, i) => {
          if (i > 0 && l.paraStart) t += b.paraGap;
          doc.text(l.text, b.x, baseline(t, b.size, b.leading));
          t += lh;
        });
        return t;
      }
      case "space":
        return top + b.h;
      case "draw":
        b.draw(top);
        return top + b.h;
      case "panel": {
        const h = heightOf(b) - b.before;
        const t = top + b.before;
        doc.setFillColor(...b.fill);
        doc.rect(b.x, t, b.w, h, "F");
        if (b.edge) {
          doc.setFillColor(...b.edge);
          doc.rect(b.x, t, 1, h, "F");
        }
        let inner = t + b.pad;
        for (const c of b.blocks) inner = render(c, inner);
        return t + h;
      }
    }
  };

  // Draws a block from y down, breaking onto new pages line by line. Used for
  // long text and for any card too tall to fit on one page.
  const flow = (b: Block) => {
    switch (b.kind) {
      case "text": {
        font(b.size, b.style, b.color);
        const lh = lineH(b.size, b.leading);
        const n = b.lines.length;
        let splitAt = -1;
        y += b.before;
        b.lines.forEach((l, i) => {
          if (i === 0 || l.paraStart) {
            // Plan the paragraph as a whole: if it has to split, leave at
            // least two lines on this page and carry at least two over;
            // otherwise start it on the next page.
            const gap = i > 0 ? b.paraGap : 0;
            let m = 1;
            while (i + m < n && !b.lines[i + m].paraStart) m++;
            const room = Math.floor((BOTTOM - y - gap) / lh + 1e-6);
            let keep = Math.min(room, m);
            if (keep < m && m - keep < 2) keep = m - 2;
            if (keep < m && keep < 2) keep = 0;
            splitAt = keep > 0 && keep < m ? i + keep : -1;
            if (keep === 0 && y > TOP) {
              newPage();
              font(b.size, b.style, b.color);
            } else {
              y += gap;
            }
          } else if (i === splitAt || y + lh > BOTTOM) {
            newPage();
            font(b.size, b.style, b.color);
          }
          doc.text(l.text, b.x, baseline(y, b.size, b.leading));
          y += lh;
        });
        return;
      }
      case "space":
        y = Math.min(y + b.h, BOTTOM);
        return;
      case "draw":
        ensure(b.h);
        b.draw(y);
        y += b.h;
        return;
      case "panel":
        y += b.before;
        b.blocks.forEach(flow);
        return;
    }
  };

  // Places blocks as one card that never splits across pages. A card taller
  // than a whole page is drawn without its frame and flows instead.
  const card = (
    blocks: Block[],
    opts: { pad?: number; fill?: RGB; border?: boolean; edge?: RGB; after?: number } = {},
  ) => {
    const pad = opts.pad ?? 0;
    const h = heightOfAll(blocks) + pad * 2;
    if (h > BOTTOM - TOP) {
      y += pad;
      blocks.forEach(flow);
      y += pad + (opts.after ?? 0);
      return;
    }
    ensure(h);
    if (opts.fill) {
      doc.setFillColor(...opts.fill);
      doc.rect(X, y, W, h, "F");
    }
    if (opts.border) {
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.3);
      doc.rect(X, y, W, h, "S");
    }
    if (opts.edge) {
      doc.setFillColor(...opts.edge);
      doc.rect(X, y, 1, h, "F");
    }
    let t = y + pad;
    for (const b of blocks) t = render(b, t);
    y += h + (opts.after ?? 0);
  };

  // ── Small drawings ──────────────────────────────────────────────────────
  const check = (x: number, top: number, color: RGB) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.55);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    doc.line(x, top + 1.3, x + 1.1, top + 2.4);
    doc.line(x + 1.1, top + 2.4, x + 3.1, top + 0.1);
    doc.setLineCap("butt");
    doc.setLineJoin("miter");
  };
  const cross = (x: number, top: number, color: RGB) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.55);
    doc.setLineCap("round");
    doc.line(x + 0.3, top + 0.3, x + 2.5, top + 2.5);
    doc.line(x + 2.5, top + 0.3, x + 0.3, top + 2.5);
    doc.setLineCap("butt");
  };
  const badge = (label: string, x: number, top: number, fill: RGB, size = 6) => {
    doc.setFillColor(...fill);
    doc.roundedRect(x, top, size, size, 1.2, 1.2, "F");
    font(9, "bold", WHITE);
    doc.text(label, x + size / 2, top + size / 2 + 1.1, { align: "center" });
  };
  // A rounded label; returns its width.
  const pill = (label: string, x: number, top: number, fg: RGB, bg: RGB) => {
    font(7.5, "bold", fg);
    const w = doc.getTextWidth(label) + 4;
    doc.setFillColor(...bg);
    doc.roundedRect(x, top, w, 4.6, 1.4, 1.4, "F");
    doc.text(label, x + 2, top + 3.25);
    return w;
  };
  const eyebrow = (label: string, x: number, at: number, color: RGB = MUTED) => {
    font(7.5, "bold", color);
    doc.text(label, x, at, { charSpace: 0.35 });
  };

  // ── Section headings ────────────────────────────────────────────────────
  const planned: string[] = [];
  const sections: { title: string; page: number }[] = [];
  const section = (title: string, explainer: string, meta: string | null, keepWith: number) => {
    font(9.5, "normal", MUTED);
    const ex = wrap(doc, explainer, W);
    const headH = 8.5 + 5 + ex.length * lineH(9.5, 1.4) + 5;
    const space = y > TOP ? 11 : 0;
    currentSection = title;
    if (y + space + headH + keepWith > BOTTOM) newPage();
    else y += space;
    const n = sections.length + 1;
    sections.push({ title, page: doc.getNumberOfPages() });

    font(14, "bold", BRAND);
    doc.text(String(n), X, y + 5.5);
    font(14, "bold", INK);
    doc.text(title, X + 7, y + 5.5);
    if (meta) {
      font(9.5, "bold", MUTED);
      doc.text(pdfSafe(meta), X + W, y + 5.5, { align: "right" });
    }
    y += 8.5;
    hairline(y);
    y += 5;
    font(9.5, "normal", MUTED);
    ex.forEach((l) => {
      doc.text(l.text, X, baseline(y, 9.5, 1.4));
      y += lineH(9.5, 1.4);
    });
    y += 5;
  };

  // ── Content ─────────────────────────────────────────────────────────────
  const scores = feedback.scores ?? ({} as EnhancedFeedbackResult["scores"]);
  const overall = band(scores.overall);
  const fixes = (feedback.priorityFixes ?? []).filter(nonEmpty);
  const gapText = nonEmpty(feedback.bandGapAnalysis) ? feedback.bandGapAnalysis : null;
  const criteria = CRITERIA.map((c) => ({ ...c, fb: feedback.feedback?.[c.key] as CategoryFeedback | undefined }))
    .map((c) => ({
      ...c,
      strengths: (c.fb?.strengths ?? []).filter(nonEmpty),
      issues: (c.fb?.issues ?? []).filter(nonEmpty),
    }))
    .filter((c) => c.strengths.length > 0 || c.issues.length > 0);
  const sentences = (feedback.sentenceAnalysis ?? []).filter((s) => nonEmpty(s?.sentence));
  const vocab = (feedback.vocabulary ?? []).filter((v) => nonEmpty(v?.word));
  const grammar = (feedback.grammar ?? []).filter((g) => nonEmpty(g?.point));
  const sample = nonEmpty(feedback.sampleResponse) ? feedback.sampleResponse : null;
  const words = essay.trim() ? countWords(essay) : (feedback.wordCount ?? 0);
  const min = MIN_WORDS[taskNum];

  if (fixes.length) planned.push("What to fix first");
  if (gapText) planned.push("Reaching the next band");
  if (criteria.length) planned.push("Feedback by criterion");
  planned.push("Your essay");
  if (sentences.length) planned.push("Sentence by sentence");
  if (vocab.length) planned.push("Vocabulary to learn");
  if (grammar.length) planned.push("Grammar to practise");
  if (sample) planned.push("Model answer");

  // ── Page 1: masthead, title, scores ─────────────────────────────────────
  await drawMasthead(doc, X, W, todayLong());
  pageSection[1] = currentSection;

  font(22, "bold", INK);
  doc.text("AI Feedback Report", X, 43.5);

  const status =
    words === 0
      ? "No essay text"
      : words >= min
        ? `${words} words · meets the ${min} minimum`
        : `${words} words · ${min - words} below the ${min} minimum`;
  font(9.5, "bold", words === 0 ? MUTED : words >= min ? MET : SHORT);
  doc.text(status, X + W, 50.5, { align: "right" });
  const statusW = doc.getTextWidth(status);
  font(10.5, "normal", MUTED);
  let subtitle = `IELTS Writing Task ${taskNum}`;
  const topic = nonEmpty(feedback.topic) ? pdfSafe(feedback.topic.trim()) : "";
  if (topic) {
    const withTopic = `${subtitle} · ${topic}`;
    if (doc.getTextWidth(withTopic) <= W - statusW - 6) subtitle = withTopic;
  }
  doc.text(subtitle, X, 50.5);

  // Score panel: the overall band on the left, the four criteria as bars on
  // the right.
  const PY = 58;
  const PH = 50;
  doc.setFillColor(...SUBTLE);
  doc.rect(X, PY, W, PH, "F");

  const lx = X + 7;
  eyebrow("OVERALL BAND", lx, PY + 10);
  font(40, "bold", overall === null ? MUTED : scoreColor(overall));
  doc.text(overall === null ? "-" : overall.toFixed(1), lx - 0.6, PY + 28);
  if (overall !== null) {
    font(11, "bold", INK);
    doc.text(bandLabel(overall), lx, PY + 35.5);
  }
  font(8.5, "normal", MUTED);
  doc.text("AI estimate, may vary by ±0.5", lx, PY + 41);

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(X + 60, PY + 7, X + 60, PY + PH - 7);

  const rx = X + 67;
  const rw = X + W - 7 - rx;
  CRITERIA.forEach((c, i) => {
    const s = band(scores[c.key]);
    const at = PY + 10.5 + i * 9.8;
    font(9.5, "normal", INK);
    doc.text(c.name, rx, at);
    font(10, "bold", s === null ? MUTED : scoreColor(s));
    doc.text(s === null ? "-" : s.toFixed(1), rx + rw, at, { align: "right" });
    doc.setFillColor(...HAIRLINE);
    doc.roundedRect(rx, at + 2.3, rw, 1.8, 0.9, 0.9, "F");
    if (s !== null) {
      doc.setFillColor(...scoreColor(s));
      doc.roundedRect(rx, at + 2.3, rw * Math.min(1, Math.max(0.04, (s - 4) / 5)), 1.8, 0.9, 0.9, "F");
    }
  });

  // What the colors mean.
  let lgx = X;
  const lgy = PY + PH + 6;
  (
    [
      [STRONG, "7.0 and above: strong"],
      [BRAND, "6.0 to 6.5: on track"],
      [WEAK, "Below 6.0: needs work"],
    ] as [RGB, string][]
  ).forEach(([color, label]) => {
    doc.setFillColor(...color);
    doc.roundedRect(lgx, lgy - 2.4, 2.6, 2.6, 0.6, 0.6, "F");
    font(8.5, "normal", MUTED);
    doc.text(label, lgx + 4, lgy);
    lgx += 4 + doc.getTextWidth(label) + 8;
  });

  // Room for "In this report", filled in once page numbers are known.
  const tocY = lgy + 10;
  const tocRows = Math.ceil(planned.length / 2);
  y = tocY + 7 + tocRows * 6.5 + 2;

  // ── 1. What to fix first ────────────────────────────────────────────────
  if (fixes.length) {
    section(
      "What to fix first",
      "The changes that will raise your band the most, in order of importance. Start with number 1.",
      null,
      24,
    );
    fixes.forEach((fix, i) => {
      const p = PRIORITY[Math.min(i, PRIORITY.length - 1)];
      const cx = X + 6;
      const tx = cx + 10;
      card(
        [
          {
            kind: "draw",
            h: 0,
            draw: (top) => {
              badge(String(i + 1), cx, top, p.color);
              eyebrow(p.label, tx, top + 2.7, p.color);
            },
          },
          text(fix, 10.5, "normal", INK, tx, X + W - 5 - tx, { before: 5 }),
        ],
        { pad: 4.5, border: true, edge: p.color, after: 3.5 },
      );
    });
  }

  // ── 2. Reaching the next band ───────────────────────────────────────────
  if (gapText) {
    section(
      "Reaching the next band",
      overall !== null && overall < 9
        ? `What stands between your ${overall.toFixed(1)} and a higher band, step by step.`
        : "What the examiner would look for at a higher band, step by step.",
      null,
      20,
    );
    card([text(gapText, 10.5, "normal", INK, X + 6, W - 11, { leading: 1.5, paraGap: 2 })], {
      pad: 5,
      fill: SUBTLE,
      edge: BRAND,
    });
  }

  // ── 3. Feedback by criterion ────────────────────────────────────────────
  if (criteria.length) {
    section(
      "Feedback by criterion",
      "Examiners mark four criteria and each one is a quarter of your band. This is what worked and what to improve in each.",
      null,
      40,
    );
    const item = (str: string, good: boolean): Block[] => {
      const body = text(str, 10, "normal", BODY, X + 10, W - 10);
      return [
        {
          kind: "draw",
          h: 0,
          draw: (top) => (good ? check(X + 4, top + 0.6, MET) : cross(X + 4, top + 1, ISSUE)),
        },
        body,
        { kind: "space", h: 1.8 },
      ];
    };
    const group = (label: string, color: RGB, list: string[], good: boolean) => {
      if (!list.length) return;
      const first = item(list[0], good);
      ensure(6 + heightOfAll(first));
      eyebrow(label, X + 4, y + 3, color);
      y += 5.5;
      list.forEach((s) => card(item(s, good)));
    };
    const groupH = (list: string[], good: boolean) =>
      list.length ? 5.5 + list.reduce((h, str) => h + heightOfAll(item(str, good)), 0) : 0;
    criteria.forEach((c, ci) => {
      if (ci > 0) y += 5;
      const s = band(scores[c.key]);
      // Keep a criterion on one page when it fits on one; otherwise at least
      // its header and first point.
      const whole =
        17 + groupH(c.strengths, true) + (c.strengths.length && c.issues.length ? 1.5 : 0) + groupH(c.issues, false);
      const firstList = c.strengths.length ? c.strengths : c.issues;
      ensure(whole <= BOTTOM - TOP ? whole : 17 + 5.5 + heightOfAll(item(firstList[0], c.strengths.length > 0)));
      doc.setFillColor(...SUBTLE);
      doc.rect(X, y, W, 13, "F");
      font(11, "bold", INK);
      doc.text(c.name, X + 4, y + 5.6);
      font(8.5, "normal", MUTED);
      doc.text(c.about, X + 4, y + 10);
      if (s !== null) {
        font(14, "bold", scoreColor(s));
        const num = s.toFixed(1);
        doc.text(num, X + W - 4, y + 8.4, { align: "right" });
        const numW = doc.getTextWidth(num);
        font(8.5, "normal", MUTED);
        doc.text("Band", X + W - 4 - numW - 1.8, y + 8.4, { align: "right" });
      }
      y += 13 + 4;
      group("WHAT WORKED", MET, c.strengths, true);
      if (c.strengths.length && c.issues.length) y += 1.5;
      group("WHAT TO IMPROVE", ISSUE, c.issues, false);
    });
  }

  // ── 4. Your essay ───────────────────────────────────────────────────────
  section(
    "Your essay",
    "The question and your answer, exactly as you submitted them.",
    words ? `${words} words` : null,
    30,
  );
  if (nonEmpty(question)) {
    const q = text(question, 10.5, "normal", INK, X + 6, W - 11);
    ensure(5.5 + heightOf(q) + 8);
    eyebrow("QUESTION", X, y + 3);
    y += 5.5;
    card([q], { pad: 4, fill: SUBTLE, edge: BRAND, after: 7 });
  }
  if (taskNum === 1 && imageSrc) {
    const img = await loadImageForPdf(imageSrc);
    if (img) {
      let w = W;
      let h = (W * img.h) / img.w;
      const maxH = 110;
      if (h > maxH) {
        h = maxH;
        w = (h * img.w) / img.h;
      }
      ensure(h);
      const imgX = X + (W - w) / 2;
      doc.addImage(img.data, "JPEG", imgX, y, w, h);
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.25);
      doc.rect(imgX, y, w, h, "S");
      y += h + 8;
    } else {
      flow(
        text(
          isPdfSrc(imageSrc)
            ? "The Task 1 chart is a PDF file, so it isn't shown in this report."
            : "The Task 1 chart couldn't be loaded, so it isn't shown in this report.",
          9.5,
          "italic",
          MUTED,
          X,
          W,
        ),
      );
      y += 6;
    }
  }
  const answer = text(essay, 11, "normal", INK, X, W, { leading: 1.6, paraGap: 2.6 });
  ensure(5.5 + lineH(11, 1.6) * 3);
  eyebrow("YOUR ANSWER", X, y + 3);
  y += 5.5;
  if (answer.kind === "text" && answer.lines.length) flow(answer);
  else flow(text("No essay text was saved with this report.", 10.5, "italic", MUTED, X, W));

  // ── 5. Sentence by sentence ─────────────────────────────────────────────
  if (sentences.length) {
    const toFix = sentences.filter((s) => s.type !== "ok").length;
    section(
      "Sentence by sentence",
      "Every sentence of your essay with the examiner's note. Where a sentence can be improved, a stronger version follows it in green.",
      toFix ? `${toFix} of ${sentences.length} to improve` : "All sentences good",
      34,
    );
    const cx = X + 6;
    const cw = W - 11;
    sentences.forEach((s, i) => {
      const t = SENTENCE_TYPES[s.type] ?? SENTENCE_TYPES.ok;
      const blocks: Block[] = [
        {
          kind: "draw",
          h: 4.6,
          draw: (top) => {
            const label = `SENTENCE ${i + 1}`;
            eyebrow(label, cx, top + 3.25);
            font(7.5, "bold", MUTED);
            pill(t.label, cx + doc.getTextWidth(label) + label.length * 0.35 + 3, top, t.fg, t.bg);
          },
        },
        text(s.sentence, 10.5, "normal", INK, cx, cw, { before: 2.5 }),
      ];
      if (nonEmpty(s.feedback)) {
        blocks.push(
          { kind: "draw", h: 6, draw: (top) => eyebrow("EXAMINER'S NOTE", cx, top + 5.2) },
          text(s.feedback, 9.5, "normal", BODY, cx, cw, { before: 1 }),
        );
      }
      const better = s.improved?.trim();
      if (s.type !== "ok" && better && better !== s.sentence.trim()) {
        blocks.push({
          kind: "panel",
          fill: MINT,
          x: cx,
          w: cw,
          pad: 3,
          before: 3.5,
          blocks: [
            { kind: "draw", h: 3.4, draw: (top) => eyebrow("BETTER VERSION", cx + 3, top + 2.6, MET) },
            text(better, 10, "normal", [6, 95, 70], cx + 3, cw - 6, { before: 1.2 }),
          ],
        });
      }
      card(blocks, { pad: 4, border: true, edge: t.fg, after: 3.5 });
    });
  }

  // ── 6. Vocabulary to learn ──────────────────────────────────────────────
  if (vocab.length) {
    section(
      "Vocabulary to learn",
      "Band 7+ words and phrases for this topic, with the Uzbek translation, the meaning and an example sentence to copy the pattern from.",
      `${vocab.length} ${vocab.length === 1 ? "word" : "words"}`,
      24,
    );
    const wordW = 44;
    const lx = X + wordW + 4;
    const vx = lx + 20;
    const vw = X + W - vx;
    hairline(y);
    vocab.forEach((v) => {
      const word = text(v.word, 11, "bold", BRAND, X, wordW, { leading: 1.35 });
      const pairs = (
        [
          ["UZBEK", v.uzbek, "normal", INK],
          ["MEANING", v.english, "normal", BODY],
          ["EXAMPLE", nonEmpty(v.exampleFromEssay) ? `"${v.exampleFromEssay.trim()}"` : "", "italic", BODY],
        ] as [string, string, Style, RGB][]
      )
        .filter(([, value]) => nonEmpty(value))
        .map(([label, value, style, color], i) => ({
          label,
          block: text(value, 10, style, color, vx, vw, { leading: 1.4, before: i > 0 ? 1.6 : 0 }),
        }));
      const rightH = pairs.reduce((h, p) => h + heightOf(p.block), 0);
      const h = Math.max(heightOf(word), rightH);
      card(
        [
          {
            kind: "draw",
            h,
            draw: (top) => {
              render(word, top);
              let t = top;
              pairs.forEach((p) => {
                const b = p.block;
                if (b.kind === "text") eyebrow(p.label, lx, baseline(t + b.before, 10, 1.4));
                t = render(b, t);
              });
            },
          },
        ],
        { pad: 3.5 },
      );
      hairline(y);
    });
  }

  // ── 7. Grammar to practise ──────────────────────────────────────────────
  if (grammar.length) {
    section(
      "Grammar to practise",
      "Structures that would lift your grammar score, each with a plain explanation and a correct example.",
      null,
      32,
    );
    grammar.forEach((g, i) => {
      const cx = X + 5;
      const tx = cx + 9;
      const tw = X + W - 5 - tx;
      const blocks: Block[] = [
        { kind: "draw", h: 0, draw: (top) => badge(String(i + 1), cx, top - 0.2, BRAND) },
        text(g.point, 11, "bold", INK, tx, tw, { leading: 1.35 }),
      ];
      if (nonEmpty(g.explanation)) blocks.push(text(g.explanation, 10, "normal", BODY, tx, tw, { before: 1.5 }));
      if (nonEmpty(g.example)) {
        blocks.push({
          kind: "panel",
          fill: SUBTLE,
          edge: BRAND,
          x: tx,
          w: tw,
          pad: 3,
          before: 3,
          blocks: [
            { kind: "draw", h: 3.4, draw: (top) => eyebrow("EXAMPLE", tx + 4, top + 2.6, BRAND) },
            text(g.example, 10, "italic", INK, tx + 4, tw - 7, { before: 1.2 }),
          ],
        });
      }
      card(blocks, { pad: 4.5, border: true, after: 3.5 });
    });
  }

  // ── 8. Model answer ─────────────────────────────────────────────────────
  if (sample) {
    section(
      "Model answer",
      "A high-band answer to the same question. Compare how it organises its ideas and the language it uses with your essay.",
      null,
      26,
    );
    flow(text(sample, 10.5, "normal", INK, X, W, { leading: 1.6, paraGap: 2.6 }));
  }

  // Free reports carry scores and fixes only; say what the full one adds.
  if (feedback.limited) {
    y += 9;
    card(
      [
        text("This is a free report", 10.5, "bold", INK, X + 6, W - 11),
        text(
          "Premium reports also include feedback on every criterion, sentence by sentence corrections, vocabulary, grammar points and a model answer.",
          10,
          "normal",
          BODY,
          X + 6,
          W - 11,
          { before: 1.2 },
        ),
      ],
      { pad: 5, fill: SUBTLE, edge: BRAND },
    );
  }

  drawToc();
  drawPageChrome(
    doc,
    X,
    W,
    `WriteReady IELTS \u00B7 AI Feedback Report \u00B7 Task ${taskNum}`,
    (p) => pageSection[p] ?? currentSection,
  );
  doc.save(fileName);

  function drawToc() {
    doc.setPage(1);
    eyebrow("IN THIS REPORT", X, tocY + 3);
    const colW = (W - 10) / 2;
    sections.forEach((s, i) => {
      const col = i < tocRows ? 0 : 1;
      const row = i % tocRows;
      const cx = X + col * (colW + 10);
      const at = tocY + 7 + row * 6.5 + 4;
      font(9.5, "bold", BRAND);
      doc.text(String(i + 1), cx, at);
      font(9.5, "normal", INK);
      doc.text(s.title, cx + 6, at);
      font(9.5, "normal", MUTED);
      doc.text(`page ${s.page}`, cx + colW, at, { align: "right" });
      hairline(at + 2.4, cx, colW);
      doc.link(cx, at - 4, colW, 6.5, { pageNumber: s.page });
    });
    doc.setPage(doc.getNumberOfPages());
  }
}
