import { useEffect, useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import { getActiveTeachers } from '../../firebase/teachers';
import type { Teacher } from '../../types';

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-900">Choose a teacher</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-slate-500 mb-4">
            Your essay (and Task 1 image, if included) will be sent to the teacher you choose for a real, human review.
          </p>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 py-6 text-center">{error}</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No teachers are available right now. Please try again later.</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  disabled={submitting}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-left disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t.photoBase64 ? (
                    <img src={t.photoBase64} alt={t.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[0.7rem] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Overall {t.ieltsOverall.toFixed(1)}
                      </span>
                      <span className="text-[0.7rem] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
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
      </div>
    </div>
  );
}
