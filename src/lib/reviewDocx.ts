import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from 'docx';
import type { HumanReview, HumanReviewTaskPart } from '../types';

function dataUrlToImage(dataUrl: string): { type: 'jpg' | 'png' | 'gif' | 'bmp'; base64: string } | null {
  const match = /^data:image\/(jpeg|jpg|png|gif|bmp);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  const type = ext === 'jpeg' ? 'jpg' : (ext as 'jpg' | 'png' | 'gif' | 'bmp');
  return { type, base64: match[2] };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Re-decodes any image (webp, unusual MIME type, etc.) through a canvas and
// re-exports as PNG, which docx's ImageRun always accepts.
function normalizeToPng(blob: Blob): Promise<{ type: 'png'; base64: string }> {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported.');
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        const match = dataUrlToImage(pngDataUrl);
        if (!match) throw new Error('Could not encode canvas to PNG.');
        resolve(match as { type: 'png'; base64: string });
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not decode image.')); };
    img.src = objectUrl;
  });
}

// Task 1 images aren't always a data: URL — Quick/Mock/Practice mode store
// them as remote ImgBB links, while Relax mode stores a true data: URL from
// a local file upload. Fetch remote URLs and normalize them so both work,
// regardless of the source's exact MIME type.
async function resolveImage(src: string): Promise<{ type: 'jpg' | 'png' | 'gif' | 'bmp'; base64: string } | null> {
  const direct = dataUrlToImage(src);
  if (direct) return direct;
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    const matched = dataUrlToImage(dataUrl);
    if (matched) return matched;
    return await normalizeToPng(blob);
  } catch (err) {
    console.error('Could not embed Task image in review docx:', src, err);
    return null;
  }
}

async function taskSection(label: string, part: HumanReviewTaskPart): Promise<Paragraph[]> {
  const children: Paragraph[] = [
    new Paragraph({ text: label, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }),
    new Paragraph({ text: 'Question', heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun(part.questionText)], spacing: { after: 200 } }),
  ];

  if (part.imageBase64) {
    const img = await resolveImage(part.imageBase64);
    if (img) {
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: img.type,
              data: img.base64,
              transformation: { width: 450, height: 300 },
            }),
          ],
          spacing: { after: 200 },
        }),
      );
    } else {
      // Couldn't embed the image (network/CORS/decode failure) — leave a
      // visible note instead of silently dropping it, so it's obvious
      // something is missing rather than looking like there was never an
      // image at all. Only show the raw link for remote URLs — dumping a
      // data: URL's base64 payload inline would just be unreadable noise.
      const isLink = /^https?:\/\//i.test(part.imageBase64);
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: isLink
                ? `⚠ Image could not be embedded — open manually: ${part.imageBase64}`
                : '⚠ Image could not be embedded.',
              italics: true,
            }),
          ],
          spacing: { after: 200 },
        }),
      );
    }
  }

  children.push(new Paragraph({ text: 'Student Essay', heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
  part.essayText.split('\n').forEach((line) => {
    children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 100 } }));
  });

  children.push(
    new Paragraph({ text: 'Teacher Feedback', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),
    new Paragraph({ text: '(Write your feedback below this line)', spacing: { after: 300 } }),
  );

  return children;
}

export async function buildReviewDocx(review: HumanReview): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: 'WriteReady IELTS — Essay for Human Review', bold: true, size: 32 })],
      spacing: { after: 100 },
    }),
    new Paragraph({ children: [new TextRun(`Student: ${review.studentName} (${review.studentEmail})`)], spacing: { after: 50 } }),
    new Paragraph({ children: [new TextRun(`Mode: ${review.mode}`)], spacing: { after: 300 } }),
  ];

  if (review.task1) children.push(...(await taskSection('Task 1', review.task1)));
  if (review.task2) children.push(...(await taskSection('Task 2', review.task2)));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}
