interface Task1Data {
  report: string;
  image?: string;
}

interface Task2Data {
  report: string;
}

export interface ReportData {
  task1?: Task1Data | null;
  task2?: Task2Data | null;
  userText1: string;
  userText2: string;
}

export function encodeReport(data: ReportData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const binString = Array.from(bytes)
    .map((b) => String.fromCodePoint(b))
    .join('');
  return btoa(binString);
}

export function decodeReport(encoded: string): ReportData {
  const binString = atob(encoded);
  const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as ReportData;
}
