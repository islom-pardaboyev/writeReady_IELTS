import qrcode from 'qrcode-generator';
import { bandLabel, writingBand } from '@shared/bandScore';
import { formatCode } from '@shared/verifyCode';
import type { FeedbackScores } from '../types';

// The score card a student saves or shares after a report: a story-size PNG
// (1080 x 1920) that looks like a results slip on a sheet of indigo ink.
//
// It is drawn straight onto a canvas rather than captured from the page with
// html2canvas. That way the picture is the same on every phone, and nothing
// breaks on CSS the capture library cannot read (Tailwind v4 colours are
// oklch, which html2canvas 1.4 rejects).
//
// Instagram and Telegram cover about the top and bottom 220px of a story
// with their own buttons, so everything that matters sits between the two.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

// DESIGN.md colours. The card is a printed thing, so it keeps the light
// "paper" palette whatever theme the student has on.
const INK = '#4f46e5';
const INK_DEEP = '#1e1b4b';
const TEXT = '#0f172a';
const MUTED = '#475569';
const HAIRLINE = '#e2e8f0';
const FIRM = '#cbd5e1';
const PAPER = '#ffffff';
const GOLD = '#f59e0b';

const SANS = 'Inter, sans-serif';
const MONO = '"IBM Plex Mono", monospace';

// The slip, and the content column inside it.
const SLIP = { x: 64, y: 212, w: 952, h: 1496, r: 40 };
const LEFT = 136;
const RIGHT = 944;
const TEAR_Y = 1436;

/**
 * The line under the scores, picked by the overall band so a 5.0 never gets a
 * line that only fits a 9. They are written as the student, because the
 * student is the one posting it. No numbers in them: each group covers more
 * than one band.
 */
const QUOTES: { min: number; lines: string[] }[] = [
  {
    min: 8.5,
    lines: [
      "I don't write essays. I write evidence.",
      'Examiners, take notes.',
      'The pen was mightier. Again.',
      'Top of the scale. Nothing left to prove.',
    ],
  },
  {
    min: 7.5,
    lines: [
      'Quiet practice, loud result.',
      'Grammar sorted. Vocabulary sorted. Next.',
      'Every sentence pulled its weight.',
      'Proof the late nights were worth it.',
    ],
  },
  {
    min: 7,
    lines: [
      'The number universities like to see.',
      'Target hit. Setting a new one.',
      'Plan B, officially deleted.',
      'Good user, according to the scale.',
    ],
  },
  {
    min: 6,
    lines: [
      'Close enough to hear the next band knocking.',
      'Not the finish line. A very good checkpoint.',
      'Solid ground. Now I build on it.',
      'One band away from the one I want.',
    ],
  },
  {
    min: 5,
    lines: [
      'Every band 7 started somewhere. This is my somewhere.',
      'Day one of the comeback.',
      'The first draft of a much better story.',
      'Writing it down. Levelling it up.',
    ],
  },
  {
    min: 0,
    lines: [
      "Started. That's the hardest part.",
      'Chapter one. Plenty of pages left.',
      'Keep writing. The band follows.',
      'Everyone starts at the bottom of the page.',
    ],
  },
];

export function quotesFor(overall: number): string[] {
  return (QUOTES.find((q) => overall >= q.min) ?? QUOTES[QUOTES.length - 1]).lines;
}

/** One row of the table on a card: a short code, a label and a figure. */
export interface CardRow {
  code: string;
  label: string;
  value: string;
  /** The row that carries the result, set in ink. */
  strong?: boolean;
}

/** Everything one card, or one page of the PDF, shows. */
export interface CardPage {
  name: string;
  /** Top right of the slip, e.g. "Writing Task 2". */
  context: string;
  figureLabel: string;
  band: number;
  rows: CardRow[];
  /** Under the tear: a line in quotes, or a plain note. */
  quote?: string;
  note?: string;
  /** A verification (api/verify.ts): the stub then carries its QR code and address. */
  verify?: { code: string; url: string };
}

/** A card for one task: its overall band and the four criteria. */
export function taskPage(
  name: string,
  taskType: 'Task 1' | 'Task 2',
  scores: FeedbackScores,
  stub: { context?: string; quote?: string; note?: string },
): CardPage {
  return {
    name,
    context: stub.context ?? `Writing ${taskType}`,
    figureLabel: 'Overall band score',
    band: scores.overall,
    rows: [
      taskType === 'Task 1'
        ? { code: 'TA', label: 'Task Achievement', value: scores.taskAchievement.toFixed(1) }
        : { code: 'TR', label: 'Task Response', value: scores.taskAchievement.toFixed(1) },
      { code: 'CC', label: 'Coherence and Cohesion', value: scores.coherenceCohesion.toFixed(1) },
      { code: 'LR', label: 'Lexical Resource', value: scores.lexicalResource.toFixed(1) },
      { code: 'GRA', label: 'Grammatical Range and Accuracy', value: scores.grammaticalRangeAccuracy.toFixed(1) },
    ],
    quote: stub.quote,
    note: stub.note,
  };
}

/**
 * The last page of a full test: the Writing band from both tasks, with the
 * working shown, so the student can check it against pages 1 and 2.
 */
export function writingBandPage(name: string, task1: FeedbackScores, task2: FeedbackScores, quote: string): CardPage {
  const w = writingBand(task1.overall, task2.overall);
  return {
    name,
    context: 'Full test · Writing',
    figureLabel: 'Writing band score',
    band: w.band,
    rows: [
      { code: 'T1', label: 'Task 1 band (counts once)', value: task1.overall.toFixed(1) },
      { code: 'T2', label: 'Task 2 band (counts twice)', value: task2.overall.toFixed(1) },
      { code: 'AVG', label: '(Task 1 + 2 \u00D7 Task 2) \u00F7 3', value: w.weighted.toFixed(2) },
      { code: 'BAND', label: 'Rounded to the nearest half band', value: w.band.toFixed(1), strong: true },
    ],
    quote,
  };
}

export function cardFileName(pages: CardPage[], ext: 'png' | 'pdf'): string {
  const last = pages[pages.length - 1];
  const what = pages.length > 1 ? 'Full_Test' : last.context.replace('Writing ', '').replace(' ', '');
  return `WriteReady_${what}_Band_${last.band.toFixed(1)}.${ext}`;
}

/** One card as a story-size PNG. */
export async function cardImage(page: CardPage): Promise<Blob> {
  const canvas = await renderCard(page, 1);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the image.'))), 'image/png');
  });
}

/**
 * The cards as a PDF, one card per page, each page the card's own 9:16 shape.
 * Pages are drawn at 1.5x, so the figures stay sharp when it is printed.
 */
export async function cardPdf(pages: CardPage[]): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const size: [number, number] = [405, 720];
  const doc = new jsPDF({ unit: 'pt', format: size, orientation: 'portrait' });
  doc.setProperties({ title: 'WriteReady IELTS score report', creator: 'WriteReady IELTS' });
  for (const [i, page] of pages.entries()) {
    if (i > 0) doc.addPage(size, 'portrait');
    const canvas = await renderCard(page, 1.5);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, size[0], size[1]);
  }
  return doc.output('blob');
}

/** Draws one card onto a new canvas, `scale` times the story size. */
async function renderCard(page: CardPage, scale: number): Promise<HTMLCanvasElement> {
  const { name, context, figureLabel, band, rows, quote, note } = page;

  // A canvas draws with whatever font is ready at that moment, and the page
  // may not have needed these weights (or the letters in the student's name)
  // yet. Loading them first stops the card coming out in a fallback font.
  await loadFonts(`${name}${context}${figureLabel}${quote ?? ''}${note ?? ''}${rows.map((r) => r.label + r.code).join('')}${bandLabel(band)}`);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_WIDTH * scale);
  canvas.height = Math.round(CARD_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.scale(scale, scale);

  drawGround(ctx);
  drawSlip(ctx, scale);

  // ── Header: the mark, the wordmark and what this card is for ──
  drawLogo(ctx, LEFT, 282, 60);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = `700 38px ${SANS}`;
  ctx.fillText('WriteReady', LEFT + 80, 326);
  const wordmark = ctx.measureText('WriteReady ').width;
  ctx.fillStyle = MUTED;
  ctx.font = `500 38px ${SANS}`;
  ctx.fillText('IELTS', LEFT + 80 + wordmark, 326);
  ctx.textAlign = 'right';
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText(context, RIGHT, 324);
  hairline(ctx, 384);

  // ── Candidate ──
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${SANS}`;
  ctx.fillText('Candidate', LEFT, 440);
  ctx.fillStyle = TEXT;
  const nameSize = fitSize(ctx, name, (s) => `700 ${s}px ${SANS}`, 60, 40, RIGHT - LEFT);
  ctx.font = `700 ${nameSize}px ${SANS}`;
  ctx.fillText(ellipsize(ctx, name, RIGHT - LEFT), LEFT, 510);

  // ── The band ──
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${SANS}`;
  ctx.fillText(figureLabel, LEFT, 588);
  ctx.fillStyle = INK;
  ctx.font = `500 240px ${MONO}`;
  drawBandFigure(ctx, band.toFixed(1), LEFT - 10, 812);
  ctx.fillStyle = TEXT;
  ctx.font = `600 42px ${SANS}`;
  ctx.fillText(bandLabel(band), LEFT, 880);
  drawStamp(ctx, 804, 712, 118);

  drawRuler(ctx, 948, band);

  // ── The table: four criteria, or the working for a full test ──
  const rowTop = 1052;
  const rowH = 86;
  rows.forEach((row, i) => {
    const y = rowTop + i * rowH;
    hairline(ctx, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = `400 26px ${MONO}`;
    ctx.fillText(row.code, LEFT, y + 55);
    ctx.fillStyle = TEXT;
    ctx.font = `${row.strong ? 600 : 500} 32px ${SANS}`;
    ctx.fillText(ellipsize(ctx, row.label, RIGHT - LEFT - 240), LEFT + 100, y + 55);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.strong ? INK : TEXT;
    ctx.font = `500 46px ${MONO}`;
    ctx.fillText(row.value, RIGHT, y + 59);
  });

  drawTearLine(ctx);

  drawStub(ctx, page);

  return canvas;
}

/** Saves a card or report to the student's downloads. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari starts the download after click() returns, so give it a moment
  // before the link it is reading from goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Drawing ─────────────────────────────────────────────────────────────────

async function loadFonts(text: string): Promise<void> {
  if (!document.fonts?.load) return;
  const faces = [
    `700 60px ${SANS}`, `600 46px ${SANS}`, `500 32px ${SANS}`, `400 22px ${SANS}`,
    `500 240px ${MONO}`, `400 26px ${MONO}`,
  ];
  const sample = `${text}0123456789.·“”ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`;
  // A font that fails to load must not cost the student the card; the canvas
  // falls back to the next font in the list.
  await Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => [])));
}

/** Deep ink with faint writing lines, like the page of an exercise book. */
function drawGround(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK_DEEP;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let y = 44; y < CARD_HEIGHT; y += 64) ctx.fillRect(0, y, CARD_WIDTH, 2);
}

/** The white slip, with a notch each side where the stub tears off. */
function drawSlip(ctx: CanvasRenderingContext2D, scale: number) {
  const slip = document.createElement('canvas');
  slip.width = Math.round(SLIP.w * scale);
  slip.height = Math.round(SLIP.h * scale);
  const s = slip.getContext('2d');
  if (!s) return;
  s.scale(scale, scale);
  s.fillStyle = PAPER;
  roundRect(s, 0, 0, SLIP.w, SLIP.h, SLIP.r);
  s.fill();
  s.globalCompositeOperation = 'destination-out';
  for (const x of [0, SLIP.w]) {
    s.beginPath();
    s.arc(x, TEAR_Y - SLIP.y, 30, 0, Math.PI * 2);
    s.fill();
  }

  // Shadows ignore the canvas scale, so they are scaled by hand.
  ctx.save();
  ctx.shadowColor = 'rgba(6, 4, 32, 0.5)';
  ctx.shadowBlur = 80 * scale;
  ctx.shadowOffsetY = 28 * scale;
  ctx.drawImage(slip, SLIP.x, SLIP.y, SLIP.w, SLIP.h);
  ctx.restore();
}

/**
 * Under the tear: the line (or note), and where the card came from. With a
 * verification, a QR code sits on the right, like the stub of a ticket, and
 * the address it opens is printed beside it for anyone who cannot scan.
 */
function drawStub(ctx: CanvasRenderingContext2D, page: CardPage) {
  const { quote, note, verify } = page;
  const qrSize = 150;
  const width = verify ? RIGHT - LEFT - qrSize - 36 : RIGHT - LEFT;
  ctx.textAlign = 'left';

  if (quote) {
    ctx.fillStyle = TEXT;
    const { size, lines } = fitLines(ctx, `\u201C${quote}\u201D`, (s) => `600 ${s}px ${SANS}`, 46, 34, width, 2);
    lines.forEach((line, i) => {
      // The opening mark hangs in the margin, so the words line up with the
      // column above them, as a typesetter would set it.
      const hang = i === 0 ? ctx.measureText('\u201C').width : 0;
      ctx.fillText(line, LEFT - hang, 1522 + i * Math.round(size * 1.3));
    });
  } else if (note) {
    ctx.fillStyle = MUTED;
    const { size, lines } = fitLines(ctx, note, (s) => `500 ${s}px ${SANS}`, 34, 26, width, 2);
    lines.forEach((line, i) => ctx.fillText(line, LEFT, 1516 + i * Math.round(size * 1.35)));
  }

  if (verify) {
    drawQr(ctx, verify.url, RIGHT - qrSize, 1474, qrSize);
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = `500 22px ${SANS}`;
    ctx.fillText('Scan to verify', RIGHT - qrSize / 2, 1662);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${SANS}`;
    ctx.fillText(ellipsize(ctx, `writeready.uz/v/${formatCode(verify.code)}`, width), LEFT, 1622);
    ctx.fillStyle = MUTED;
    ctx.font = `400 22px ${SANS}`;
    ctx.fillText('AI estimate. Not an official IELTS score.', LEFT, 1662);
    return;
  }

  ctx.fillStyle = INK;
  ctx.font = `700 34px ${SANS}`;
  ctx.fillText('writeready.uz', LEFT, 1656);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${SANS}`;
  ctx.fillText('AI estimate. Not an official IELTS score.', RIGHT, 1654);
}

/**
 * A QR code drawn square by square, so it stays sharp at any scale. Each
 * square is a whole number of pixels, which keeps faint seams from showing
 * between them. The paper around it is the quiet zone scanners need.
 */
function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxSize: number) {
  const qr = qrcode(0, 'M');
  // Capitals, digits and URL punctuation fit the compact alphanumeric mode.
  qr.addData(text, /^[0-9A-Z $%*+\-./:]+$/.test(text) ? 'Alphanumeric' : 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.floor(maxSize / count);
  const offset = Math.floor((maxSize - cell * count) / 2);
  ctx.fillStyle = TEXT;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(x + offset + col * cell, y + offset + row * cell, cell, cell);
    }
  }
}

/** The largest size from `max` down to `min` at which `text` wraps into `maxLines` lines. */
function fitLines(
  ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string,
  max: number, min: number, width: number, maxLines: number,
): { size: number; lines: string[] } {
  let size = max;
  let lines: string[] = [];
  for (; size >= min; size -= 2) {
    ctx.font = font(size);
    lines = wrap(ctx, text, width);
    if (lines.length <= maxLines) return { size, lines };
  }
  size += 2;
  ctx.font = font(size);
  return { size, lines: lines.slice(0, maxLines) };
}

/**
 * The big band, drawn a character at a time. In a monospaced face the point
 * gets as much room as a digit, which at this size reads as "8 . 0", so it is
 * given a narrower slot.
 */
function drawBandFigure(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const cell = ctx.measureText('0').width;
  const narrow = cell * 0.42;
  let at = x;
  for (const ch of text) {
    if (ch === '.') {
      ctx.fillText(ch, at - (cell - narrow) / 2, y);
      at += narrow;
    } else {
      ctx.fillText(ch, at, y);
      at += cell;
    }
  }
}

function drawTearLine(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = FIRM;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(SLIP.x + 48, TEAR_Y);
  ctx.lineTo(SLIP.x + SLIP.w - 48, TEAR_Y);
  ctx.stroke();
  ctx.restore();
}

function hairline(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(LEFT, y, RIGHT - LEFT, 2);
}

/** The whole 0 to 9 band scale, inked up to the student's overall band. */
function drawRuler(ctx: CanvasRenderingContext2D, y: number, band: number) {
  const at = (b: number) => LEFT + ((RIGHT - LEFT) * b) / 9;
  ctx.save();

  ctx.fillStyle = FIRM;
  for (let half = 0; half <= 18; half++) {
    const whole = half % 2 === 0;
    ctx.fillRect(Math.round(at(half / 2)) - 1, y + 16, 2, whole ? 18 : 10);
  }

  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = HAIRLINE;
  ctx.beginPath();
  ctx.moveTo(LEFT, y);
  ctx.lineTo(RIGHT, y);
  ctx.stroke();

  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(LEFT, y);
  ctx.lineTo(at(band), y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(at(band), y, 16, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `400 26px ${MONO}`;
  for (let b = 0; b <= 9; b++) {
    ctx.fillStyle = b === band ? INK : MUTED;
    ctx.fillText(String(b), at(b), y + 70);
  }
  ctx.restore();
}

/** An ink stamp, set at a slant like one pressed by hand. */
function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.2);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;

  const ring = (radius: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(r - 4, 7);
  ring(r - 16, 2.5);
  ring(r - 58, 2.5);

  // The words run round the ring, spaced evenly so they meet themselves.
  const text = 'WRITEREADY IELTS · AI ASSESSED · ';
  ctx.font = `500 21px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    ctx.rotate(i * step);
    ctx.translate(0, -(r - 37));
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  // The logo's W and tick in the middle, in the same single ink.
  const s = 64 / 312;
  ctx.translate(-260 * s, -244 * s);
  ctx.scale(s, s);
  ctx.lineWidth = 56;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(104, 176);
  ctx.lineTo(180, 368);
  ctx.lineTo(256, 216);
  ctx.lineTo(332, 368);
  ctx.lineTo(416, 120);
  ctx.stroke();
  ctx.restore();
}

/** public/logo.svg, drawn as paths so it stays sharp at any size. */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 512;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = INK;
  roundRect(ctx, 0, 0, 512, 512, 112);
  ctx.fill();
  ctx.lineWidth = 56;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(104, 176);
  ctx.lineTo(180, 368);
  ctx.lineTo(256, 216);
  ctx.lineTo(332, 368);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(332, 368);
  ctx.lineTo(416, 120);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The largest size from `max` down to `min` at which `text` fits. */
function fitSize(
  ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, min: number, width: number,
): number {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= width) break;
  }
  return size;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
