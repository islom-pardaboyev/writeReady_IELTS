// Kept apart from src/lib/pdfShared.ts, so counting words never loads jsPDF.

export const MIN_WORDS = { 1: 150, 2: 250 } as const;

// Same rule the writing screens use for their live word count.
export const countWords = (text: string) => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};
