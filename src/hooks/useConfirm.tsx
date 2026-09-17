import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((msg: string, opts: ConfirmOptions = {}) => {
    setMessage(msg);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    setOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    >
      <DialogContent className="max-w-sm overscroll-contain">
        <DialogHeader>
          <DialogTitle>{options.title ?? "Are you sure?"}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => settle(false)}>
            {options.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={options.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
