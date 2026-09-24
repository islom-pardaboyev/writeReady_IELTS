import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { FlaskConical } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { getScoreTestSettings, saveScoreTestSettings } from "@/lib/scoreTest";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Field, Notice, Switch } from "@/components/staff/parts";

/** The account the test is for, as the panel shows it. */
interface TestAccount {
  uid: string;
  email: string;
}

/** Finds a student account by email. Emails are stored as typed, so try the lower-case form too. */
async function findAccount(email: string): Promise<TestAccount | null> {
  for (const candidate of new Set([email, email.toLowerCase()])) {
    const snap = await getDocs(query(collection(db, "users"), where("email", "==", candidate), limit(1)));
    const found = snap.docs[0];
    if (found) return { uid: found.id, email: String(found.data().email ?? candidate) };
  }
  return null;
}

/**
 * Admin -> Settings -> Score test. Turns on a "Scores only (test)" button in
 * the writing modes for one account, to see how the site grades an essay.
 * See src/lib/scoreTest.ts for where it is stored and api/feedback.ts
 * (runScoreTest) for the marking.
 */
export function ScoreTestControl() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [account, setAccount] = useState<TestAccount | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getScoreTestSettings(db);
        setEnabled(settings.enabled);
        if (settings.uid) {
          const user = await getDoc(doc(db, "users", settings.uid));
          setAccount({ uid: settings.uid, email: user.exists() ? String(user.data().email ?? "") : "" });
        }
      } catch (e) {
        console.error(e);
        setNotice({ tone: "error", text: "Could not load the score test settings. Reload the page to try again." });
      }
      setLoading(false);
    })();
  }, []);

  const toggle = async (next: boolean) => {
    if (next && !account) {
      setNotice({ tone: "error", text: "Set the account first, then turn the test on." });
      return;
    }
    setEnabled(next);
    setNotice(null);
    try {
      await saveScoreTestSettings(db, { enabled: next });
    } catch (e) {
      console.error(e);
      setEnabled(!next);
      setNotice({ tone: "error", text: "Could not change the score test. Try again." });
    }
  };

  const saveAccount = async () => {
    const typed = email.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(typed)) {
      setNotice({ tone: "error", text: "Enter the email of the student account you test with." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const found = await findAccount(typed);
      if (!found) {
        setNotice({ tone: "error", text: `No student account uses ${typed}. Sign in on the site with it once, then try again.` });
      } else {
        await saveScoreTestSettings(db, { uid: found.uid });
        setAccount(found);
        setEmail("");
        setNotice({ tone: "success", text: `The test is now for ${found.email || typed}.` });
      }
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not save the account. Try again." });
    }
    setSaving(false);
  };

  return (
    <section
      className={cn(
        "rounded-xl border bg-[var(--bg-card)]",
        enabled ? "border-amber-300 dark:border-amber-900/70" : "border-[var(--border-color)]",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              enabled
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
            )}
          >
            <FlaskConical size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Score test</h2>
              <Badge variant={enabled ? "warning" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
            </div>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--text-secondary)]">
              Adds a <span className="font-medium text-[var(--text-primary)]">Scores only (test)</span> button next to Get AI
              feedback, for one account only. It marks the essay exactly as a free report does and shows the band scores.
              Nothing is saved, no report is used, and each run is marked fresh. Every run is one AI marking, so it costs the
              same as a free report.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={toggle}
          disabled={loading || (!enabled && !account)}
          label="Turn the score test on or off"
        />
      </header>

      <form
        className="border-t border-[var(--border-color)] px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void saveAccount();
        }}
      >
        <Field
          label={account ? "Change the account" : "Account"}
          htmlFor="score-test-email"
          hint={
            account ? (
              <>
                Now for <span className="font-medium text-[var(--text-primary)]">{account.email || "an account with no email"}</span>.
                Only this account sees the button.
              </>
            ) : (
              "The student account you test with. Only this account sees the button."
            )
          }
        >
          <div className="flex max-w-md gap-2">
            <Input
              id="score-test-email"
              name="score-test-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" loading={saving} disabled={loading || !email.trim()} className="shrink-0">
              {account ? "Change" : "Set account"}
            </Button>
          </div>
        </Field>
      </form>

      {notice && (
        <div className="px-5 pb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
    </section>
  );
}
