// The message sent to the teachers' Telegram group when a student picks a
// teacher for a Human Check. Kept free of Firebase and network calls so it can
// be tested on its own.

// Same rule as src/lib/telegram.ts (api/ and src/ are separate builds).
const TELEGRAM_USERNAME_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

const PORTAL_URL = 'https://www.writeready.uz/teacher-portal';

/** Telegram HTML mode only needs these three escaped. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function words(text: unknown): string {
  const t = typeof text === 'string' ? text.trim() : '';
  const n = t ? t.split(/\s+/).length : 0;
  return `${n} ${n === 1 ? 'word' : 'words'}`;
}

export interface TeacherNoticeInput {
  teacherName: string;
  /** "@username" saved on the teacher, if any. */
  telegram?: unknown;
  studentName: string;
  task1?: { essayText?: unknown };
  task2?: { essayText?: unknown };
}

export function buildTeacherNotice(input: TeacherNoticeInput): string {
  const tag = typeof input.telegram === 'string' && TELEGRAM_USERNAME_RE.test(input.telegram)
    ? input.telegram
    : null;

  const tasks = [
    input.task1 ? `Task 1 (${words(input.task1.essayText)})` : '',
    input.task2 ? `Task 2 (${words(input.task2.essayText)})` : '',
  ].filter(Boolean).join(' + ');

  const lines = [
    '📝 <b>New essay to review</b>',
    '',
    // A plain @username in the text is what makes Telegram notify that person.
    tag
      ? `${tag}, you have a new essay to check.`
      : `${esc(input.teacherName)} has a new essay to check.`,
    `<b>Student:</b> ${esc(input.studentName || 'Student')}`,
    tasks ? `<b>Essay:</b> ${tasks}` : '',
    '',
    `Open the teacher portal: ${PORTAL_URL}`,
  ];

  if (!tag) {
    lines.push('', `⚠️ ${esc(input.teacherName)} has no Telegram username saved, so nobody could be tagged. The admin can add it in the admin panel.`);
  }

  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}
