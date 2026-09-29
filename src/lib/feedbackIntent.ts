/**
 * Who may start a report by opening a report link.
 *
 * A report page's address carries the whole essay (src/lib/reportEncoding.ts),
 * so anyone can make one, with any essay in it. The page used to start the AI
 * marking the moment it opened for a signed-in student, which spent that
 * student's weekly or monthly report on whatever essay the link held. A link in
 * a message was enough.
 *
 * Now only a link the student's own writing page has just made starts by
 * itself: the writing pages call allowFeedbackStart() as they open the report.
 * Any other link (pasted, sent by someone, opened in a new tab from history)
 * shows the essay and asks the student to press a button first. A report the
 * student already has is still shown straight away and costs nothing.
 *
 * Kept in sessionStorage, so it belongs to this tab only, and only the newest
 * link is remembered.
 */
const KEY = 'wr_feedback_start';

/** A short fingerprint, so a page address that can be very long is not stored whole. */
function fingerprint(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return `${id.length}:${(h >>> 0).toString(36)}`;
}

/** Call with the encoded report right before navigating to /feedback/<it>. */
export function allowFeedbackStart(id: string): void {
  try {
    sessionStorage.setItem(KEY, fingerprint(id));
  } catch {
    /* storage blocked: the page then asks for a click, which is the safe way round */
  }
}

/** True when this report link was made by this tab's own writing page. */
export function mayStartFeedback(id: string | undefined): boolean {
  if (!id) return false;
  try {
    return sessionStorage.getItem(KEY) === fingerprint(id);
  } catch {
    return false;
  }
}
