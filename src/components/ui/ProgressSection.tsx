import { useEffect, useState } from 'react';
import { getAllFeedbackReports, type FeedbackReport } from '../../firebase/firestore';

const CATEGORY_LABELS: Record<string, string> = {
  taskAchievement: 'Task Achievement',
  coherenceCohesion: 'Coherence & Cohesion',
  lexicalResource: 'Lexical Resource',
  grammaticalRangeAccuracy: 'Grammar & Accuracy',
};

function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function bandColor(val: number): string {
  if (val >= 7) return '#10b981';
  if (val >= 6) return '#3b82f6';
  if (val >= 5) return '#f59e0b';
  return '#ef4444';
}

interface TrendChartProps {
  reports: FeedbackReport[];
}

function TrendChart({ reports }: TrendChartProps) {
  const W = 600;
  const H = 140;
  const PAD = { top: 12, right: 16, bottom: 28, left: 28 };

  const points = reports.map((r) => {
    const vals = Object.values(r.scores).filter((v) => typeof v === 'number' && v !== r.scores.overall);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : (r.scores.overall ?? 0);
  });

  const min = Math.max(0, Math.min(...points) - 0.5);
  const max = Math.min(9, Math.max(...points) + 0.5);
  const range = max - min || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
  const toY = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;

  const pathD = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(' ');

  const areaD =
    points.length > 1
      ? `${pathD} L ${toX(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`
      : '';

  const lastVal = points[points.length - 1] ?? 0;
  const firstVal = points[0] ?? 0;
  const trend = lastVal - firstVal;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-[var(--text-primary)] text-sm">Band Score Trend</h3>
        {points.length > 1 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
        {/* Grid lines */}
        {[5, 6, 7, 8].map((band) => {
          if (band < min || band > max) return null;
          const y = toY(band);
          return (
            <g key={band}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4 4" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-secondary)">{band}</text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaD && (
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {areaD && <path d={areaD} fill="url(#areaGrad)" />}

        {/* Line */}
        {points.length > 1 && (
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Dots */}
        {points.map((v, i) => (
          <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill={bandColor(v)} stroke="var(--bg-card)" strokeWidth="1.5" />
        ))}

        {/* X-axis labels */}
        {reports.map((r, i) => {
          if (points.length > 6 && i % 2 !== 0) return null;
          return (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">
              {formatDate(r.createdAt)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface CategoryBarsProps {
  reports: FeedbackReport[];
}

function CategoryBars({ reports }: CategoryBarsProps) {
  const categories = Object.keys(CATEGORY_LABELS);
  const avgs: Record<string, number> = {};
  for (const cat of categories) {
    const vals = reports.map((r) => r.scores[cat]).filter((v) => typeof v === 'number');
    avgs[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const sorted = categories.slice().sort((a, b) => avgs[a] - avgs[b]);

  return (
    <div>
      <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-3">Category Average Scores</h3>
      <div className="flex flex-col gap-3">
        {sorted.map((cat) => {
          const val = avgs[cat];
          const pct = Math.min(100, (val / 9) * 100);
          const isWeak = val < 6;
          const color = val >= 7 ? 'bg-emerald-500' : val >= 6 ? 'bg-blue-500' : val >= 5 ? 'bg-amber-500' : 'bg-red-400';
          return (
            <div key={cat}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-[var(--text-primary)] font-medium">{CATEGORY_LABELS[cat]}</span>
                <div className="flex items-center gap-1.5">
                  {isWeak && <span className="text-[0.6rem] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">Weak zone</span>}
                  <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">{val > 0 ? val.toFixed(1) : '—'}</span>
                </div>
              </div>
              <div className="h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressSection({ uid }: { uid: string }) {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllFeedbackReports(uid)
      .then(setReports)
      .finally(() => setLoading(false));
  }, [uid]);

  if (loading) {
    return (
      <div className="mb-10">
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Your Progress</h2>
        <div className="h-48 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] animate-pulse" />
      </div>
    );
  }

  if (reports.length < 2) return null;

  return (
    <div className="mb-10">
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Your Progress</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-[var(--shadow-sm)]">
          <TrendChart reports={reports} />
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-[var(--shadow-sm)]">
          <CategoryBars reports={reports} />
        </div>
      </div>
    </div>
  );
}
