import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface ModalCardProps {
  open: boolean;
  /** Runs on Escape. Leave it out when the modal must not be dismissed from the keyboard. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * An unstyled modal shell for cards that bring their own look. It adds what a
 * plain overlay div lacks: focus moves into the card and stays there, Escape
 * closes it, and focus returns to where it was once it closes.
 */
export function ModalCard({ open, onClose, children }: ModalCardProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        {/* Content covers the screen, so a click on the backdrop stays inside it and never dismisses the card. */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 overscroll-contain focus:outline-none"
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const ModalTitle = DialogPrimitive.Title;
export const ModalDescription = DialogPrimitive.Description;
