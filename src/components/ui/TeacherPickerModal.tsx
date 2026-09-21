import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { getActiveTeachers } from '../../firebase/teachers';
import type { Teacher } from '../../types';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { LogoLoader } from './LogoLoader';

interface TeacherPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (teacher: Teacher) => void;
  submitting?: boolean;
}

export function TeacherPickerModal({ open, onClose, onSelect, submitting }: TeacherPickerModalProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getActiveTeachers()
      .then(setTeachers)
      .catch(() => setError('Could not load teachers. Please try again.'))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 rounded-2xl">
        <div className="h-1.5 bg-linear-to-r from-emerald-500 to-teal-500" />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="w-5 h-5 text-emerald-600" />
            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-neutral-100">Choose a teacher</DialogTitle>
          </div>

          <DialogDescription className="text-sm text-slate-500 dark:text-neutral-400 mb-4">
            Your essay (and Task 1 image, if included) will be sent to the teacher you choose for a real, human review.
          </DialogDescription>

          {loading ? (
            <div className="flex justify-center py-10">
              <LogoLoader size={44} label="Loading teachers" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 py-6 text-center">{error}</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-neutral-400 py-6 text-center">No teachers are available right now. Please try again later.</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  disabled={submitting}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-neutral-800 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-colors text-left disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t.photoBase64 ? (
                    <img src={t.photoBase64} alt={t.name} width={44} height={44} loading="lazy" className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100 truncate">{t.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[0.7rem] font-medium text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                        Overall {t.ieltsOverall.toFixed(1)}
                      </span>
                      <span className="text-[0.7rem] font-medium text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                        Writing {t.ieltsWriting.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {submitting && (
            <p className="text-sm text-emerald-600 text-center mt-4">Sending your essay…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
