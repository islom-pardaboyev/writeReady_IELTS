import { Link } from 'react-router';
import { Wallet } from 'lucide-react';
import { Button } from './Button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';

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
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 rounded-2xl">
        <div className="h-1.5 bg-linear-to-r from-emerald-500 to-teal-500" />
        <div className="p-7">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-emerald-50 mb-4">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>

          {priceLoading ? (
            <>
              <DialogTitle className="sr-only">Loading Human Check price</DialogTitle>
              <div className="flex justify-center py-6">
                <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" role="status" aria-label="Loading price" />
              </div>
            </>
          ) : canAfford ? (
            <>
              <DialogTitle className="text-base font-semibold text-slate-900 mb-1">
                Human Check costs {price?.toLocaleString()} UZS
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 leading-6 mb-1">
                This amount will be deducted from your balance once you choose a teacher.
              </DialogDescription>
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
              <DialogTitle className="text-base font-semibold text-slate-900 mb-1">Not enough balance</DialogTitle>
              <DialogDescription className="text-sm text-slate-500 leading-6 mb-1">
                Human Check costs {price?.toLocaleString()} UZS, but your balance is only {balance.toLocaleString()} UZS.
              </DialogDescription>
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
      </DialogContent>
    </Dialog>
  );
}
