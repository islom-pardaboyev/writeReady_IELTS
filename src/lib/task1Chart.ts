import { useEffect, useState } from "react";
import { doc, deleteDoc, getDoc, setDoc, type Firestore } from "firebase/firestore";

// Task 1 charts, stored in Firestore as compressed data URLs, the same way
// teacher photos already are (src/firebase/teachers.ts).
//
// They sit in their own collection rather than on the prompt document,
// because all three modes download the WHOLE task1_reports collection to fill
// the shuffle bag (Mock.tsx, Quick.tsx, Practice.tsx; on a first visit, and
// again whenever the admin changes a prompt, see src/lib/promptCache.ts), and the Web SDK
// has no way to fetch part of a document — there is no select() outside the
// Admin SDK. A chart on the prompt would mean every student downloading every
// chart on every page load. The prompt keeps only a thumbnail, small enough to
// ride along unnoticed; the full chart is fetched for the prompt on screen.

export const CHART_COLLECTION = "task1_images";

/**
 * Budget for a chart that travels inside the report link instead of the
 * database. encodeReport base64-encodes the whole report, which adds about a
 * third, so this keeps the resulting URL well inside what browsers accept.
 */
export const LINK_CHART_MAX_BYTES = 150_000;

// Firestore allows 1 MiB per document. Stay well under it: the chart is the
// only real content in the document, but the cap counts field names and
// encoding overhead too.
const MAX_BYTES = 850_000;

// Big enough to stay sharp in a PDF report, which scales anything larger down
// to 1800px anyway (src/lib/loadImageForPdf.ts).
const FULL_MAX_DIM = 1400;

// Shown at 56x40 in the admin prompt list and nowhere else, so it can be tiny.
// Every student downloads one of these per prompt, so a couple of KB matters.
const THUMB_MAX_DIM = 96;
const THUMB_QUALITY = 0.5;

function isPdfFile(file: File | Blob): boolean {
  const name = (file as File).name ?? "";
  return file.type === "application/pdf" || /\.pdf$/i.test(name);
}

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

// An object URL hands the file straight to the image decoder. Reading it into
// a base64 string first would build a megabyte of text only to throw it away.
function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (fn: () => void) => () => {
      URL.revokeObjectURL(url);
      fn();
    };
    img.onload = done(() => resolve(img));
    img.onerror = done(() => reject(new Error("That file is not an image we can read.")));
    img.src = url;
  });
}

// Charts are flat-coloured line art, so JPEG on a white background keeps them
// crisp at a fraction of the size of the PNG an admin usually uploads.
function render(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize images.");
  // Flatten onto white so a transparent PNG chart doesn't come out black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface CompressedChart {
  /** Full-size chart, for the writing screen and the PDF report. */
  full: string;
  /** Thumbnail for the admin list. Empty for a PDF, which cannot be drawn. */
  thumb: string;
}

/**
 * Shrinks an uploaded chart until it fits in a Firestore document. Tries
 * lower quality first, then smaller dimensions, so a chart only loses size
 * once it has already given up everything it can spare in quality.
 *
 * PDFs cannot be re-encoded in the browser, so they are stored as they are,
 * or rejected with an explanation if they are too big.
 *
 * `maxBytes` is the budget for the result. Quick Write passes a smaller one,
 * because a chart a student uploads themselves travels inside the report link
 * rather than living in the database.
 */
export async function compressChartFile(file: File | Blob, maxBytes = MAX_BYTES): Promise<CompressedChart> {
  if (isPdfFile(file)) {
    const data = await readAsDataUrl(file);
    if (data.length > maxBytes) {
      throw new Error("That PDF is too big to use. Save the chart as a PNG or JPG and upload that instead.");
    }
    return { full: data, thumb: "" };
  }

  const img = await loadImage(file);
  for (const dim of [FULL_MAX_DIM, 1100, 900, 700]) {
    for (const quality of [0.82, 0.7, 0.6, 0.5]) {
      const full = render(img, dim, quality);
      if (full.length <= maxBytes) {
        return { full, thumb: render(img, THUMB_MAX_DIM, THUMB_QUALITY) };
      }
    }
  }
  throw new Error("That image is too detailed to store. Try a smaller or simpler version of the chart.");
}

export async function saveTask1Chart(db: Firestore, id: string, full: string): Promise<void> {
  await setDoc(doc(db, CHART_COLLECTION, id), { data: full, updatedAt: new Date() });
}

export async function deleteTask1Chart(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, CHART_COLLECTION, id));
}

/** A prompt as the writing screens hold it. The id is what finds the chart. */
export interface ChartPrompt {
  id?: string;
}

// One chart is shown repeatedly — the shuffle bag comes back round, students
// reopen the same prompt — so remember what we fetched for this page view.
const cache = new Map<string, string>();

/** Resolves the chart for a prompt. Empty when the prompt has none. */
export async function loadTask1Chart(db: Firestore, prompt: ChartPrompt): Promise<string> {
  const id = prompt.id;
  if (!id) return "";

  const cached = cache.get(id);
  if (cached !== undefined) return cached;

  try {
    const snap = await getDoc(doc(db, CHART_COLLECTION, id));
    const data = snap.exists() ? ((snap.data().data as string) ?? "") : "";
    cache.set(id, data);
    return data;
  } catch (err) {
    // Not cached: a dropped connection should not stick for the whole visit.
    console.error("Could not load the Task 1 chart", err);
    return "";
  }
}

/** Drops a chart from the in-memory cache, so an edit shows up right away. */
export function forgetTask1Chart(id: string): void {
  cache.delete(id);
}

/**
 * The chart for the prompt currently on screen. Shows a chart already fetched
 * this visit straight away, so coming back to a prompt does not flash empty.
 */
export function useTask1Chart(db: Firestore, prompt: ChartPrompt | null): string {
  const id = prompt?.id ?? "";
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!id) {
      setSrc("");
      return;
    }
    let active = true;
    setSrc(cache.get(id) ?? "");
    loadTask1Chart(db, { id }).then((resolved) => {
      if (active) setSrc(resolved);
    });
    return () => {
      active = false;
    };
  }, [db, id]);

  return src;
}
