import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import {
  getFeatureFlag,
  getHumanCheckPlatformFee,
  getHumanCheckPrice,
  setFeatureFlag,
  setHumanCheckPlatformFee,
  setHumanCheckPrice,
} from "@/hooks/useFeatureFlag";
import { MaintenanceControl } from "@/components/admin/MaintenanceControl";
import { ScoreTestControl } from "@/components/admin/ScoreTestControl";
import { adminDb as db } from "@/firebase/adminConfig";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Field, Notice, PageHeading, Switch } from "@/components/staff/parts";
import { uzs } from "./format";

export function SettingsSection() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [savedPrice, setSavedPrice] = useState(0);
  const [savedFee, setSavedFee] = useState(0);
  const [saving, setSaving] = useState<"price" | "fee" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [flag, p, f] = await Promise.all([getFeatureFlag("humanCheck", db), getHumanCheckPrice(db), getHumanCheckPlatformFee(db)]);
        setEnabled(flag);
        setPrice(String(p));
        setFee(String(f));
        setSavedPrice(p);
        setSavedFee(f);
      } catch (e) {
        console.error(e);
        setNotice({ tone: "error", text: "Could not load the Human Check settings." });
      }
      setLoading(false);
    })();
  }, []);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await setFeatureFlag("humanCheck", next, db);
    } catch (e) {
      console.error(e);
      setEnabled(!next);
      setNotice({ tone: "error", text: "Could not change Human Check. Try again." });
    }
  };

  const savePrice = async () => {
    const n = Number(price);
    if (!n || n <= 0) { setNotice({ tone: "error", text: "The price must be more than 0." }); return; }
    if (n <= savedFee) { setNotice({ tone: "error", text: `The price must be higher than your fee (${uzs(savedFee)}), or teachers would earn nothing.` }); return; }
    setSaving("price");
    setNotice(null);
    try {
      await setHumanCheckPrice(n, db);
      setSavedPrice(n);
      setNotice({ tone: "success", text: `Price saved: ${uzs(n)} per review.` });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not save the price. Try again." });
    }
    setSaving(null);
  };

  const saveFee = async () => {
    const n = Number(fee);
    if (Number.isNaN(n) || n < 0) { setNotice({ tone: "error", text: "The fee cannot be negative." }); return; }
    if (n >= savedPrice) { setNotice({ tone: "error", text: `The fee must be lower than the price (${uzs(savedPrice)}), or teachers would earn nothing.` }); return; }
    setSaving("fee");
    setNotice(null);
    try {
      await setHumanCheckPlatformFee(n, db);
      setSavedFee(n);
      setNotice({ tone: "success", text: `Platform fee saved: ${uzs(n)} per review.` });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not save the fee. Try again." });
    }
    setSaving(null);
  };

  const teacherGets = Math.max(0, (Number(price) || 0) - (Number(fee) || 0));

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6 lg:px-10">
      <PageHeading title="Settings" description="Site-wide switches. Changes apply to every visitor right away." />
      <div className="flex flex-col gap-6">
        <MaintenanceControl />

        <ScoreTestControl />

        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                <GraduationCap size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Human Check</h2>
                <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--text-secondary)]">
                  Lets students pay from their balance to have a teacher review an essay. Turn it on once you have active teachers.
                </p>
              </div>
            </div>
            <Switch checked={enabled} onChange={toggle} disabled={loading} label="Show Human Check to students" />
          </header>

          <div className="grid gap-5 border-t border-[var(--border-color)] px-5 py-5 sm:grid-cols-2">
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); savePrice(); }}>
              <Field label="Price per review (UZS)" htmlFor="hc-price" hint="Taken from the student's balance." className="flex-1">
                <Input name="hc-price" autoComplete="off" id="hc-price" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} disabled={loading} className="font-mono" />
              </Field>
              <Button type="submit" variant="outline" loading={saving === "price"} disabled={loading || Number(price) === savedPrice} className="mb-5">Save</Button>
            </form>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); saveFee(); }}>
              <Field label="Your fee per review (UZS)" htmlFor="hc-fee" hint="You keep this part of each checked review." className="flex-1">
                <Input name="hc-fee" autoComplete="off" id="hc-fee" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} disabled={loading} className="font-mono" />
              </Field>
              <Button type="submit" variant="outline" loading={saving === "fee"} disabled={loading || fee === "" || Number(fee) === savedFee} className="mb-5">Save</Button>
            </form>
            <p className="text-sm text-[var(--text-secondary)] sm:col-span-2">
              With these numbers a teacher earns <span className="font-mono font-medium tabular-nums text-[var(--text-primary)]">{uzs(teacherGets)}</span> per review.
            </p>
            {notice && <Notice tone={notice.tone} className="sm:col-span-2">{notice.text}</Notice>}
          </div>
        </section>
      </div>
    </div>
  );
}
