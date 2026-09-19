import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { X } from "lucide-react";
import { ModalCard, ModalDescription, ModalTitle } from "@/components/ui/ModalCard";
import { useTheme } from "@/hooks/useTheme";
import { confirmLeaveUnsavedWork } from "@/hooks/useUnsavedWork";
import {
  ALT_LABEL,
  isEditableTarget,
  isRecordingShortcut,
  matchShortcut,
  SHORTCUT_ACTIONS,
  SHORTCUTS_HELP_EVENT,
  toggleAssistant,
  useShortcutBindings,
} from "@/lib/shortcuts";
import { ShortcutKeys } from "./ShortcutKeys";

/**
 * Runs the student's keyboard shortcuts on every page, opens the shortcut list
 * on "?" (or from the sidebar button), and briefly confirms what a shortcut did
 * when the page itself doesn't show it.
 */
export function GlobalShortcuts() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const bindings = useShortcutBindings();
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const showNotice = (text: string) => {
      window.clearTimeout(noticeTimer.current);
      setNotice(text);
      noticeTimer.current = window.setTimeout(() => setNotice(""), 2400);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || isRecordingShortcut()) return;

      if (e.key === "?" && !e.altKey && !e.ctrlKey && !e.metaKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      const action = matchShortcut(e, bindings);
      if (!action) return;
      e.preventDefault();
      setHelpOpen(false);

      if (action.id === "toggleTheme") {
        const next = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(next);
        showNotice(next === "dark" ? "Dark mode on" : "Light mode on");
      } else if (action.id === "toggleAssistant") {
        if (!toggleAssistant()) showNotice("The AI assistant isn't available on this page");
      } else if (action.path && action.path !== pathname && confirmLeaveUnsavedWork()) {
        navigate(action.path);
      }
    };

    const onHelp = () => setHelpOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(SHORTCUTS_HELP_EVENT, onHelp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(SHORTCUTS_HELP_EVENT, onHelp);
    };
  }, [bindings, navigate, pathname, resolvedTheme, setTheme]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  return (
    <>
      <ModalCard open={helpOpen} onClose={() => setHelpOpen(false)}>
        <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <ModalTitle className="text-lg font-bold text-[var(--text-primary)]">Keyboard shortcuts</ModalTitle>
              <ModalDescription className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                Hold {ALT_LABEL} and press the key. They work anywhere on the site, even while you type.
              </ModalDescription>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <ul className="mt-4 px-6">
            {SHORTCUT_ACTIONS.map((a) => {
              const code = bindings[a.id];
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-4 border-t border-[var(--border-color)] py-2.5 first:border-t-0"
                >
                  <span className="text-sm text-[var(--text-primary)]">{a.label}</span>
                  {code ? (
                    <ShortcutKeys code={code} />
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">Off</span>
                  )}
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-4 border-t border-[var(--border-color)] py-2.5">
              <span className="text-sm text-[var(--text-primary)]">Show this list</span>
              <ShortcutKeys keys={["?"]} />
            </li>
          </ul>

          <div className="mt-2 flex items-center justify-between gap-4 rounded-b-2xl border-t border-[var(--border-color)] bg-[var(--bg-subtle)] px-6 py-3.5">
            <span className="text-xs text-[var(--text-secondary)]">Saved in this browser</span>
            <Link
              to="/account#shortcuts"
              onClick={() => setHelpOpen(false)}
              className="text-sm font-semibold text-[var(--ink-blue)] no-underline hover:underline"
            >
              Change shortcuts
            </Link>
          </div>
        </div>
      </ModalCard>

      {/* Confirms shortcuts whose effect isn't obvious; also read out by screen readers. */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-full bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-card)] shadow-lg transition-opacity duration-200 ${notice ? "opacity-100" : "opacity-0"}`}
      >
        {notice}
      </div>
    </>
  );
}
