export function isPdfSrc(src: string): boolean {
  return src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
}

// Largest side, in pixels, of an image embedded in a PDF report. Bigger
// uploads are scaled down so the file stays small without looking soft.
const MAX_SIDE = 1800;

// Loads an image as a data URL plus its natural size, for embedding into a
// jsPDF report. JPEG output is flattened onto white so transparent PNG charts
// don't turn black. Returns null for PDFs (not embeddable as an image) or on
// any load failure.
export async function loadImageForPdf(
  src: string,
  format: "jpeg" | "png" = "jpeg",
): Promise<{ data: string; w: number; h: number } | null> {
  if (!src || isPdfSrc(src)) return null;

  let url = src;
  let objectUrl: string | null = null;
  if (!src.startsWith("data:")) {
    // A blob URL is same-origin, so the canvas below isn't tainted.
    try {
      const res = await fetch(src);
      if (res.ok) url = objectUrl = URL.createObjectURL(await res.blob());
    } catch {
      // Fall back to a CORS image load below.
    }
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (!objectUrl && !url.startsWith("data:")) el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return {
      data: canvas.toDataURL(format === "jpeg" ? "image/jpeg" : "image/png", 0.9),
      w,
      h,
    };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
