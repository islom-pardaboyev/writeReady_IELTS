import { Link } from 'react-router-dom';
import { Wallet, X } from 'lucide-react';
import { Button } from './Button';

interface HumanCheckConfirmModalProps {
  open: boolean;
  priceLoading: boolean;
  price: number | null;
  balance: number;
  canAfford: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function HumanCheckConfirmModal({ open, priceLoading, price, balance, canAfford, onCancel, onConfirm }: HumanCheckConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="p-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-emerald-50">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {priceLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
            </div>
          ) : canAfford ? (
            <>
              <h2 className="text-base font-semibold text-slate-900 mb-1">Human Check costs {price?.toLocaleString()} UZS</h2>
              <p className="text-sm text-slate-500 leading-6 mb-1">
                This amount will be deducted from your balance once you choose a teacher.
              </p>
              <p className="text-xs text-slate-400 mb-6">Your balance: {balance.toLocaleString()} UZS</p>
              <div className="flex flex-col gap-2.5">
                <Button onClick={onConfirm} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  Continue
                </Button>
                <Button variant="secondary" onClick={onCancel} className="w-full">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-900 mb-1">Not enough balance</h2>
              <p className="text-sm text-slate-500 leading-6 mb-1">
                Human Check costs {price?.toLocaleString()} UZS, but your balance is only {balance.toLocaleString()} UZS.
              </p>
              <p className="text-xs text-slate-400 mb-6">Top up your balance to use Human Check.</p>
              <div className="flex flex-col gap-2.5">
                <Link to="/pricing">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    Top up balance
                  </Button>
                </Link>
                <Button variant="secondary" onClick={onCancel} className="w-full">
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
