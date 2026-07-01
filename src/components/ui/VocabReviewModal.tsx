import { useState, useEffect } from 'react';
import type { SpacedRepItem, SRSRating } from '../../types';
import { rateVocabCard } from '../../firebase/firestore';

interface Props {
  items: SpacedRepItem[];
  uid: string;
  onClose: () => void;
}

const RATINGS: { key: SRSRating; label: string; sub: string; color: string }[] = [
  { key: 'again', label: 'Again', sub: '<10m',  color: 'bg-red-500 hover:bg-red-600' },
  { key: 'hard',  label: 'Hard',  sub: '1d',    color: 'bg-[#1e3a5f] hover:bg-[#162d4a]' },
  { key: 'good',  label: 'Good',  sub: '2d',    color: 'bg-[#2c4a6e] hover:bg-[#1e3a5f]' },
  { key: 'easy',  label: 'Easy',  sub: '6d',    color: 'bg-[#3d6b9e] hover:bg-[#2c4a6e]' },
];

export function VocabReviewModal({ items: initialItems, uid, onClose }: Props) {
  const [queue, setQueue] = useState<SpacedRepItem[]>([...initialItems]);
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState<SRSRating | null>(null);
  const [done, setDone] = useState(false);

  const current = queue[0];

  useEffect(() => {
    setRevealed(false);
    setRating(null);
  }, [queue[0]?.itemId]);

  async function handleRate(r: SRSRating) {
    if (!current || rating) return;
    setRating(r);
    try {
      await rateVocabCard(uid, current.itemId, r, current.interval, current.easeFactor);
    } catch { /* silent — UI still advances */ }
    setTimeout(() => {
      setQueue((prev) => {
        const rest = prev.slice(1);
        if (r === 'again') return [...rest, { ...current, interval: 0 }];
        return rest;
      });
      if (r !== 'again' && queue.length === 1) setDone(true);
    }, 320);
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-[#f5f0e8] flex flex-col items-center justify-center px-6" onClick={onClose}>
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-black text-[#1e3a5f] mb-2">Session complete!</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-8">All cards reviewed. Come back tomorrow for the next round.</p>
        <button
          onClick={onClose}
          className="bg-[#1e3a5f] text-white font-bold px-8 py-3 rounded-full text-sm"
        >
          Done
        </button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#f5f0e8] flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-[#555] text-sm font-medium"
        >
          <span className="text-base">✕</span> Close
        </button>
        <div className="text-right">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[#888]">REVIEW SESSION</p>
          <p className="text-sm font-bold text-[#333]">{queue.length} left</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[#e0d8cc] mx-5 rounded-full mb-4">
        <div
          className="h-full bg-[#1e3a5f] rounded-full transition-all duration-500"
          style={{ width: `${Math.max(4, ((initialItems.length - queue.length) / initialItems.length) * 100)}%` }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col px-5 pb-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e0d4] flex-1 flex flex-col p-6 min-h-0">
          {/* Tag */}
          <div className="mb-4">
            <span className="bg-[#eee] text-[#666] text-[0.65rem] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              REVIEW
            </span>
          </div>

          {/* Front: word */}
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-[#aaa] mb-2">DEFINE</p>
            <h2 className="text-[1.75rem] font-black text-[#1a1a1a] mb-4" style={{ fontFamily: 'Georgia, serif' }}>
              {current.word}
            </h2>

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="self-start text-sm text-[#888] border border-[#ddd] rounded-full px-4 py-1.5 hover:bg-[#f5f0e8] transition-colors"
              >
                Show answer ↓
              </button>
            ) : (
              <div className="animate-fade-in">
                <div className="border-t border-[#eee] pt-4 mt-2">
                  <p className="text-[0.8125rem] text-[#444] leading-relaxed mb-3">
                    {current.english}
                  </p>
                  {current.uzbek && (
                    <span className="inline-block bg-amber-100 text-amber-800 text-[0.7rem] font-bold px-2.5 py-0.5 rounded-full mb-3">
                      O'zbek: {current.uzbek}
                    </span>
                  )}
                  {current.exampleFromEssay && (
                    <p className="text-[0.8125rem] text-[#1e3a5f] italic leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                      "{current.exampleFromEssay}"
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      <div className={`grid grid-cols-4 gap-2 px-5 pb-6 transition-opacity duration-200 ${revealed ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
        {RATINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => handleRate(r.key)}
            disabled={!!rating}
            className={`${r.color} text-white rounded-xl py-3 flex flex-col items-center gap-0.5 transition-all duration-150 active:scale-95 disabled:opacity-60`}
          >
            <span className="text-[0.875rem] font-bold">{r.label}</span>
            <span className="text-[0.65rem] text-white/60">{r.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
