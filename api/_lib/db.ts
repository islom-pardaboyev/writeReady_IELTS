import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let standIn: Firestore | null = null;

/**
 * The Firestore that saved reports, score locks and verifications use.
 * scripts/test-score-store.ts swaps in an in-memory stand-in, so that code
 * can be tested without touching the live database (local development
 * shares it with the real site). Nothing else calls setTestFirestore.
 */
export const db = (): Firestore => standIn ?? getFirestore();

export function setTestFirestore(fake: Firestore | null): void {
  standIn = fake;
}
