/**
 * The band-score rules, in one place.
 *
 * The API (api/feedback.ts), the browser (src/pages/FeedbackPage.tsx and the
 * progress, leaderboard and center screens) and the test script
 * (scripts/compare-band-scores.ts) all import this file. Before it existed
 * each kept its own copy, and they drifted: the student saw the overall band
 * the model worked out, while the database stored the one the server worked
 * out, and the progress chart averaged the numbers a third way.
 *
 * It has no imports on purpose, so both builds can use it.
 */

export const CRITERIA = [
  'taskAchievement',
  'coherenceCohesion',
  'lexicalResource',
  'grammaticalRangeAccuracy',
] as const;

export type Criterion = (typeof CRITERIA)[number];

export type BandScores = Record<Criterion, number> & { overall: number };

/**
 * One criterion band as a number from 0 to 9 in half-band steps, or null when
 * the model gave something that is not a number at all.
 */
export function cleanBand(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(9, Math.max(0, Math.round(n * 2) / 2));
}

/**
 * Official IELTS rounding: the mean of the four criteria to the nearest half
 * band, with the exact .25 and .75 cases rounded up (6.25 -> 6.5, 6.75 -> 7.0).
 */
export function overallBand(ta: number, cc: number, lr: number, gra: number): number {
  // Each band as a whole number of half bands, so the maths stays exact.
  const sum = [ta, cc, lr, gra].map((s) => Math.round(s * 2)).reduce((a, b) => a + b, 0);
  const r = sum % 4;
  const halves = r === 0 ? sum / 4 : r === 1 ? (sum - 1) / 4 : (sum + 4 - r) / 4;
  return halves / 2;
}

/**
 * The Writing band for a full test (Task 1 and Task 2). IELTS counts Task 2
 * twice as much as Task 1. This works from the two task bands the student
 * sees on the report, so they can check the sum themselves, and rounds the
 * result the same way as overallBand: to the nearest half band, with .25 and
 * .75 rounding up (6.25 -> 6.5, 6.75 -> 7.0).
 */
export function writingBand(task1Band: number, task2Band: number): { weighted: number; band: number } {
  // Task 1 + 2 x Task 2, counted in half bands so the maths stays exact.
  const h = Math.round(task1Band * 2) + 2 * Math.round(task2Band * 2);
  return {
    weighted: h / 6,
    // The nearest half band to h / 6, rounding up when it sits halfway.
    band: Math.floor((2 * h + 3) / 6) / 2,
  };
}

/**
 * The four criteria cleaned, and the overall band worked out here, never
 * taken from the model's own arithmetic. Null when any criterion is missing,
 * so a broken reply can never turn into a made-up score.
 */
export function normalizeScores(raw: unknown): BandScores | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const [ta, cc, lr, gra] = CRITERIA.map((k) => cleanBand(r[k]));
  if (ta === null || cc === null || lr === null || gra === null) return null;
  return {
    taskAchievement: ta,
    coherenceCohesion: cc,
    lexicalResource: lr,
    grammaticalRangeAccuracy: gra,
    overall: overallBand(ta, cc, lr, gra),
  };
}

/**
 * The one number that stands for a saved report: its overall band. Reports
 * saved before the overall was worked out in code fall back to the stored
 * overall. Null when the report holds no usable score.
 */
export function reportBand(scores: unknown): number | null {
  const s = normalizeScores(scores);
  if (s) return s.overall;
  return cleanBand((scores as { overall?: unknown } | null | undefined)?.overall);
}

/**
 * Pulls the JSON object out of a model reply. The reply should be bare JSON,
 * but a code fence or a stray line before or after it must not cost the
 * student their report.
 */
export function extractJson(raw: string): unknown {
  return readJson(raw).value;
}

/**
 * extractJson, and whether the reply had to be repaired to read.
 *
 * The full report is about 25,000 characters of JSON that the model writes
 * freehand: its schema is too big for the API to enforce (api/feedback.ts).
 * Now and then it slips: a double quote left unescaped inside a text value
 * ("missing "who" here"), a bracket never closed, a comma before a closing
 * bracket. One such slip used to throw away the whole reply, scores and all,
 * and the student got "Feedback incomplete" again and again. A reply that is
 * not valid JSON is read again by readLooseJson, which gets past them.
 */
export function readJson(raw: string): { value: unknown; repaired: boolean } {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in the reply.');
  try {
    return { value: JSON.parse(raw.slice(start, end + 1)), repaired: false };
  } catch (e) {
    try {
      return { value: readLooseJson(raw.slice(start)), repaired: true };
    } catch {
      throw e;
    }
  }
}

/**
 * Reads a JSON object the way a person would, past the slips a model makes in
 * a long reply: quotes and line breaks left unescaped inside text, commas
 * missing or one too many, a bracket missing, one too many, or the wrong kind.
 * It never invents a value. Everything it returns is in the reply, where the
 * reply's own brackets put it; liftReportFields then moves report sections
 * that a missing bracket left inside another one.
 *
 * Brackets still open at the end are closed, but only when the reply ends on
 * a closing bracket. A reply cut off in the middle (at the token cap, or on a
 * dropped connection) still fails, so it is never taken for a whole one.
 */
export function readLooseJson(text: string): unknown {
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  // What follows the last closing bracket of a reply that stopped mid-value.
  const cutOff = /["{[:,]/.test(text.slice(last + 1));
  return new LooseReader(text.slice(0, last + 1), !cutOff).read();
}

class LooseReader {
  private i = 0;
  private readonly s: string;
  private readonly mayClose: boolean;

  constructor(s: string, mayClose: boolean) {
    this.s = s;
    this.mayClose = mayClose;
  }

  read(): Record<string, unknown> {
    this.i = this.skip(0);
    if (this.s[this.i] !== '{') throw new Error('The reply does not start with an object.');
    this.i++;
    return this.object(true, false);
  }

  private object(isRoot: boolean, inArray: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (;;) {
      this.i = this.skip(this.i);
      const c = this.s[this.i];
      if (c === undefined) return this.unclosed(out);
      if (c === '}') {
        this.i++;
        // One brace too many closed the whole reply early: the rest of it
        // still belongs to the same object.
        if (isRoot && /[,"]/.test(this.s[this.skip(this.i)] ?? '')) continue;
        return out;
      }
      if (c === ']') {
        // An object in an array that was never closed: this closes both.
        if (inArray) return out;
        this.i++;
        continue;
      }
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === '{') {
        // In an array, the item before this one was never closed: this is
        // the next item. Anywhere else, an opening brace written twice.
        if (inArray && Object.keys(out).length) return out;
        this.i++;
        continue;
      }
      const key = this.key();
      if (key === null) {
        this.i++;
        continue;
      }
      this.member(out, key, inArray);
    }
  }

  /** The value after a key, up to and including its colon. */
  private member(out: Record<string, unknown>, key: string, inArray: boolean): void {
    this.i = this.skip(this.i);
    if (this.s[this.i] === ':') this.i++;
    const value = this.value(inArray);
    // Set as a key, "__proto__" would change the object's prototype instead.
    if (key !== '__proto__') out[key] = value;
  }

  /** An object whose opening brace was left out, from its first key on. */
  private objectFrom(key: string, inArray: boolean): Record<string, unknown> {
    const first: Record<string, unknown> = {};
    this.member(first, key, false);
    return { ...first, ...this.object(false, inArray) };
  }

  private array(): unknown[] {
    const out: unknown[] = [];
    for (;;) {
      this.i = this.skip(this.i);
      const c = this.s[this.i];
      if (c === undefined) return this.unclosed(out);
      if (c === ']') {
        this.i++;
        return out;
      }
      if (c === '}') {
        // Either a brace too many between the array's items, or the array
        // was never closed and this brace closes the object around it.
        if (this.strayBrace()) {
          this.i++;
          continue;
        }
        return out;
      }
      if (c === ',' || c === ':' || c === '[') {
        // A report never puts an array straight inside another one.
        this.i++;
        continue;
      }
      if (this.isKeyAt(this.i)) {
        // A key in an array: the item it starts lost its opening brace, when
        // it is the first item or the item before it has the same key.
        // Otherwise the array was never closed, and the key is the next one
        // of the object around it.
        const at = this.i;
        const key = this.key()!;
        const last = out[out.length - 1];
        if (out.length && !(isObject(last) && key in last)) {
          this.i = at;
          return out;
        }
        out.push(this.objectFrom(key, true));
        continue;
      }
      out.push(this.value(true));
    }
  }

  private value(inArray: boolean): unknown {
    this.i = this.skip(this.i);
    const c = this.s[this.i];
    if (c === '{') {
      this.i++;
      return this.object(false, inArray);
    }
    if (c === '[') {
      this.i++;
      return this.array();
    }
    if (c === '"') {
      this.i++;
      const text = this.string();
      // Followed by a colon, it was the first key of an object whose opening
      // brace was left out ("scores": "taskAchievement": 7, ...).
      return this.s[this.skip(this.i)] === ':' ? this.objectFrom(text, inArray) : text;
    }
    return this.bare();
  }

  /** A key in quotes (keys never hold one), or a bare word the model forgot to quote. */
  private key(): string | null {
    if (this.s[this.i] === '"') {
      const end = this.s.indexOf('"', this.i + 1);
      if (end === -1) return null;
      const key = this.s.slice(this.i + 1, end);
      this.i = end + 1;
      return key;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 64));
    if (!word) return null;
    this.i += word[0].length;
    return word[0];
  }

  private string(): string {
    let out = '';
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) {
        if (!this.mayClose) throw new Error('The reply ends inside a text value.');
        return out;
      }
      this.i++;
      if (c === '\\') out += this.escape();
      else if (c === '"' && this.endsString()) return out;
      else out += c;
    }
  }

  /**
   * A quote ends the text only when what follows it can follow a string in
   * JSON: a colon, a closing bracket, the next key (a comma missing), or a
   * comma and then the next value or a closing bracket (a comma too many).
   */
  private endsString(): boolean {
    let j = this.skip(this.i);
    const next = this.s[j];
    if (next === undefined || next === ':' || next === '}' || next === ']') return true;
    // A comma left out before the next key or the next item.
    if (next === '"') return this.isKeyAt(j) || /^"[^"\\\n]*"\s*[,\]}]/.test(this.s.slice(j, j + 400));
    if (next !== ',') return false;
    j = this.skip(j + 1);
    // After a comma in this report comes a key, a string, an object, an array
    // or a number, or a bracket or a comma when one comma was too many. A
    // quote followed by ", which ..." is inside the text.
    return j >= this.s.length || /["{[\]}\d,-]/.test(this.s[j]);
  }

  private escape(): string {
    const c = this.s[this.i];
    if (c === undefined) return '';
    this.i++;
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    if (c === 'b') return '\b';
    if (c === 'f') return '\f';
    if (c === 'u' && /^[0-9a-fA-F]{4}$/.test(this.s.slice(this.i, this.i + 4))) {
      this.i += 4;
      return String.fromCharCode(parseInt(this.s.slice(this.i - 4, this.i), 16));
    }
    return c;
  }

  /** A number, true, false or null, or a word the model left unquoted. */
  private bare(): unknown {
    const start = this.i;
    while (this.i < this.s.length && !/[,{}[\]":\n\r]/.test(this.s[this.i])) this.i++;
    const token = this.s.slice(start, this.i).trim();
    if (token === '' || token === 'null') return null;
    if (token === 'true') return true;
    if (token === 'false') return false;
    const n = Number(token);
    return Number.isFinite(n) ? n : token;
  }

  /** Whether the brace at this.i, inside an array, is one too many rather than the end of the array. */
  private strayBrace(): boolean {
    let j = this.skip(this.i + 1);
    const next = this.s[j];
    if (next === ']' || next === '{') return true;
    if (next === '"') return !this.isKeyAt(j);
    if (next !== ',') return false;
    j = this.skip(j + 1);
    return this.s[j] === '{' || (this.s[j] === '"' && !this.isKeyAt(j));
  }

  private isKeyAt(j: number): boolean {
    return /^"[^"\\\n]{1,60}"\s*:/.test(this.s.slice(j, j + 80));
  }

  private unclosed<T>(value: T): T {
    if (!this.mayClose) throw new Error('The reply ends before its brackets close.');
    return value;
  }

  private skip(j: number): number {
    while (j < this.s.length && /\s/.test(this.s[j])) j++;
    return j;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The top-level sections of a report, each with how to tell it from a field of the same name elsewhere. */
const REPORT_SECTIONS: Record<string, (v: unknown) => boolean> = {
  topic: (v) => typeof v === 'string',
  wordCount: (v) => typeof v === 'number',
  scores: (v) => normalizeScores(v) !== null,
  feedback: (v) => isObject(v) && CRITERIA.some((k) => isObject(v[k])),
  priorityFixes: Array.isArray,
  readability: (v) => isObject(v) && ('tips' in v || 'summary' in v),
  bandGapAnalysis: (v) => typeof v === 'string',
  sampleResponse: (v) => typeof v === 'string',
  sentenceAnalysis: Array.isArray,
  // The evidence has a "vocabulary" and a "grammar" too, but they are objects.
  vocabulary: Array.isArray,
  grammar: Array.isArray,
};

/**
 * Puts report sections back at the top of the report when a bracket in the
 * wrong place left them inside another section: an "evidence" never closed
 * holds everything after it, scores included, and a brace too many leaves a
 * criterion's feedback or band at the top. Both happened in real replies,
 * whose scores were then lost. Moves only what the reply wrote, and never
 * replaces a section that is already where it belongs.
 *
 * Changes `report` in place; true when anything moved.
 */
export function liftReportFields(report: Record<string, unknown>): boolean {
  let moved = false;
  // A criterion at the top was meant for scores, feedback or bandRationale,
  // and its kind of value says which.
  for (const k of CRITERIA) {
    const v = report[k];
    const home = cleanBand(v) !== null ? 'scores' : isObject(v) ? 'feedback' : typeof v === 'string' ? 'bandRationale' : null;
    if (!home) continue;
    const box = isObject(report[home]) ? report[home] : {};
    if (k in box) continue;
    box[k] = v;
    report[home] = box;
    delete report[k];
    moved = true;
  }
  // A brace left out at the end of one criterion's feedback puts the
  // criteria after it inside it.
  const feedback = report.feedback;
  if (isObject(feedback)) {
    for (const c of CRITERIA) {
      const inner = feedback[c];
      if (!isObject(inner)) continue;
      for (const k of CRITERIA) {
        if (k === c || k in feedback || !isObject(inner[k])) continue;
        feedback[k] = inner[k];
        delete inner[k];
        moved = true;
      }
    }
  }
  const missing = Object.keys(REPORT_SECTIONS).filter((name) => !REPORT_SECTIONS[name](report[name]));
  if (!missing.length) return moved;
  // Breadth first, so the outermost copy of a section wins.
  const queue: unknown[] = Object.values(report);
  for (let n = 0; n < queue.length && missing.length; n++) {
    const node = queue[n];
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!isObject(node)) continue;
    for (const name of [...missing]) {
      if (!REPORT_SECTIONS[name](node[name])) continue;
      report[name] = node[name];
      delete node[name];
      missing.splice(missing.indexOf(name), 1);
      moved = true;
    }
    queue.push(...Object.values(node));
  }
  return moved;
}

/**
 * The official IELTS name for a band. Each name belongs to a whole band, so a
 * half band takes the name of the band below it: 6.5 is a strong "Competent
 * user", not yet a "Good user" (Band 7). Rounding up would flatter the student.
 */
export function bandLabel(score: number): string {
  if (score >= 9) return 'Expert user';
  if (score >= 8) return 'Very good user';
  if (score >= 7) return 'Good user';
  if (score >= 6) return 'Competent user';
  if (score >= 5) return 'Modest user';
  if (score >= 4) return 'Limited user';
  if (score >= 3) return 'Extremely limited user';
  if (score >= 2) return 'Intermittent user';
  if (score >= 1) return 'Non-user';
  return 'Did not attempt';
}
