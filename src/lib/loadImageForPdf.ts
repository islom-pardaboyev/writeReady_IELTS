export function isPdfSrc(src: string): boolean {
  return src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
}

// Shared by Quick and Relax modes: fetches (or reuses, for data: URLs) an
// image as a base64 data URL plus its natural dimensions, for embedding into
// a jsPDF report. Returns null for PDFs (not embeddable as an image) or on
// any load failure.
export async function loadImgBase64(
  src: string,
): Promise<{ b64: string; w: number; h: number } | null> {
  if (isPdfSrc(src)) return null;
  try {
    let dataUrl = src;
    if (!src.startsWith("data:")) {
      const res = await fetch(src);
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
    const { w, h } = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = dataUrl;
    });
    return { b64: dataUrl, w, h };
  } catch {
    return null;
  }
}
