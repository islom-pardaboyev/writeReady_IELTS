import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebase, getUid, resolvePaidStatus } from '../shared.js';
import { listArchive, loadArchived, pdfHistoryLimit } from '../reportArchive.js';

/**
 * The dashboard's "Download PDF" on a recent report (src/pages/DashboardPage.tsx).
 *
 *   POST {}             -> { ids, limit }  the reports the student can download now
 *   POST { reportId }   -> { raw, essay, question, taskType, chartId?, chartImage? }
 *
 * The limit is read from the student's plan on every call, so a plan that has
 * ended or shrunk loses the older downloads straight away.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch {
    return res.status(500).json({ error: 'Downloads are not available right now.' });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in.' });
  }

  try {
    const user = await getFirestore().collection('users').doc(uid).get();
    const limit = pdfHistoryLimit(resolvePaidStatus(user.data() ?? {}).plan);
    const { reportId } = (req.body ?? {}) as { reportId?: unknown };

    if (reportId === undefined) {
      return res.status(200).json({ ids: await listArchive(uid, limit), limit });
    }
    if (typeof reportId !== 'string' || !/^[\w-]{1,128}$/.test(reportId)) {
      return res.status(400).json({ error: 'Unknown report.' });
    }
    const report = await loadArchived(uid, reportId, limit);
    if (!report) {
      return res.status(404).json({ error: 'This report is no longer kept for download.' });
    }
    return res.status(200).json(report);
  } catch (e) {
    console.error('report-pdf:', e);
    return res.status(503).json({ error: 'Could not load the report. Please try again.' });
  }
}
