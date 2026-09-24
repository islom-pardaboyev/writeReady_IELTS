import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { FileText, ImagePlus, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { compressChartFile, deleteTask1Chart, forgetTask1Chart, loadTask1Chart, saveTask1Chart } from "@/lib/task1Chart";
import { bumpPromptsVersion } from "@/lib/promptCache";

// Students keep the prompt list in their browser (src/lib/promptCache.ts);
// this tells their next visit to fetch it again. Failing it only delays the
// change for them, so it never fails the admin's save.
const markPromptsChanged = () =>
  bumpPromptsVersion(db).catch((e) => console.error("Could not mark the prompts as changed:", e));
import { isPdfSrc } from "@/lib/loadImageForPdf";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader } from "@/components/staff/ListDetail";
import { EmptyState, Field, FileButton, LoadError, Notice, RowSkeletons, SearchField } from "@/components/staff/parts";
import type { SectionProps, SetState } from "./types";

export interface Prompt { id: string; report: string; thumb?: string; /** Full chart, fetched when the prompt is opened. Not stored here. */ chart?: string }

// A chart may be uploaded as a PDF, which an <img> cannot render.
function ChartPreview({ src, className, pdfHeight }: { src: string; className: string; pdfHeight: string }) {
  if (isPdfSrc(src)) {
    return <object data={src} type="application/pdf" className={`w-full ${pdfHeight}`} aria-label="Task 1 chart" />;
  }
  return <img src={src} alt="Task 1 chart" width={1200} height={800} loading="lazy" className={className} />;
}

const COPY = {
  1: {
    title: "Task 1 prompts",
    singular: "Task 1 prompt",
    collection: "task1_reports",
    empty: "Add the first chart or diagram question for Task 1 practice.",
  },
  2: {
    title: "Task 2 prompts",
    singular: "Task 2 prompt",
    collection: "task2_reports",
    empty: "Add the first essay question for Task 2 practice.",
  },
} as const;

export function PromptsSection({
  task,
  list,
  setList,
  loading,
  failed,
  reload,
  intent,
  clearIntent,
}: SectionProps & {
  task: 1 | 2;
  list: Prompt[];
  setList: SetState<Prompt[]>;
  loading: boolean;
  failed: boolean;
  reload: () => void;
}) {
  const copy = COPY[task];
  const hasImage = task === 1;
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftImage, setDraftImage] = useState("");
  const [draftThumb, setDraftThumb] = useState("");
  const [draftReport, setDraftReport] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [newImage, setNewImage] = useState("");
  const [newThumb, setNewThumb] = useState("");
  const [newReport, setNewReport] = useState("");
  const [adding, setAdding] = useState(false);
  const [newError, setNewError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const selected = list.find((p) => p.id === selectedId) ?? null;

  // The list carries only thumbnails, so the full chart is fetched when a
  // prompt is opened and cached back onto the list entry. The token guards
  // against a slow fetch landing after the admin has moved on.
  const chartLoad = useRef(0);

  const select = (id: string | null) => {
    setSelectedId(id);
    setNotice(null);
    const p = list.find((x) => x.id === id);
    const known = p?.chart ?? "";
    setDraftImage(known);
    setDraftThumb(p?.thumb ?? "");
    setDraftReport(p?.report ?? "");
    if (!hasImage || !p || known) return;
    const token = ++chartLoad.current;
    loadTask1Chart(db, p).then((full) => {
      if (token !== chartLoad.current || !full) return;
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, chart: full } : x)));
      // Leave it alone if the admin picked a new file while this was loading.
      setDraftImage((cur) => (cur === known ? full : cur));
    });
  };

  const startNew = () => {
    setSelectedId("new");
    setNewError("");
  };

  const guard = async (next: () => void) => {
    if (dirty && !(await confirm("You changed this prompt but did not save. Discard the changes?", { title: "Discard changes?", confirmLabel: "Discard" }))) return;
    next();
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") startNew();
    if (intent.action === "search") searchRef.current?.focus();
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const filtered = useMemo(
    () => list.filter((p) => p.report.toLowerCase().includes(search.toLowerCase())),
    [list, search],
  );

  const dirty = !!selected && (draftReport !== selected.report || (hasImage && draftImage !== (selected.chart ?? "")));

  const add = async () => {
    if (hasImage ? !newImage || !newReport.trim() : !newReport.trim()) {
      setNewError(hasImage ? "Add both an image and the question." : "Write the question first.");
      return;
    }
    setAdding(true);
    setNewError("");
    try {
      const dup = await getDocs(query(collection(db, copy.collection), where("report", "==", newReport)));
      if (!dup.empty) {
        setNewError("This question is already in the list.");
        return;
      }
      const data = hasImage
        ? { thumb: newThumb, report: newReport, createdAt: new Date() }
        : { report: newReport, createdAt: new Date() };
      const ref = await addDoc(collection(db, copy.collection), data);
      if (hasImage) await saveTask1Chart(db, ref.id, newImage);
      await markPromptsChanged();
      const created: Prompt = hasImage
        ? { id: ref.id, chart: newImage, thumb: newThumb, report: newReport }
        : { id: ref.id, report: newReport };
      setList((p) => [created, ...p]);
      setNewImage("");
      setNewThumb("");
      setNewReport("");
      setSelectedId(created.id);
      setDraftImage(created.chart ?? "");
      setDraftThumb(created.thumb ?? "");
      setDraftReport(created.report);
      setNotice({ tone: "success", text: "Prompt added. Students can get it from now on." });
    } catch (e) {
      console.error(e);
      setNewError("Could not add the prompt. Try again.");
    } finally {
      setAdding(false);
    }
  };

  const save = async () => {
    if (!selected || !draftReport.trim() || (hasImage && !draftImage)) return;
    setSaving(true);
    setNotice(null);
    try {
      const chartChanged = hasImage && draftImage !== (selected.chart ?? "");
      const updates = hasImage ? { thumb: draftThumb, report: draftReport } : { report: draftReport };
      await updateDoc(doc(db, copy.collection, selected.id), updates);
      await markPromptsChanged();
      if (chartChanged) {
        await saveTask1Chart(db, selected.id, draftImage);
        forgetTask1Chart(selected.id);
      }
      const patch = hasImage ? { ...updates, chart: draftImage } : updates;
      setList((p) => p.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)));
      setNotice({ tone: "success", text: "Changes saved." });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not save the changes. Try again." });
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await confirm(`Delete this ${copy.singular}? Students will stop getting it. This cannot be undone.`, { title: "Delete prompt?", destructive: true, confirmLabel: "Delete" }))) return;
    await deleteDoc(doc(db, copy.collection, selected.id));
    await markPromptsChanged();
    if (hasImage) {
      await deleteTask1Chart(db, selected.id);
      forgetTask1Chart(selected.id);
    }
    setList((p) => p.filter((t) => t.id !== selected.id));
    setSelectedId(null);
  };

  const uploadTo = async (file: File, set: (full: string, thumb: string) => void) => {
    setUploading(true);
    try {
      const { full, thumb } = await compressChartFile(file);
      set(full, thumb);
    } catch (e) {
      console.error(e);
      const text = e instanceof Error ? e.message : "Could not read that file. Try another one.";
      if (selectedId === "new") setNewError(text);
      else setNotice({ tone: "error", text });
    } finally {
      setUploading(false);
    }
  };

  const listPane = (
    <ListPane
      title={copy.title}
      count={list.length}
      action={
        <Button size="sm" onClick={() => guard(startNew)}>
          <Plus aria-hidden="true" /> New
        </Button>
      }
      toolbar={<SearchField value={search} onChange={setSearch} placeholder="Search questions…" label={`Search ${copy.title}`} inputRef={searchRef} />}
    >
      {loading && list.length === 0 ? (
        <RowSkeletons />
      ) : failed && list.length === 0 ? (
        <LoadError what="the prompts" onRetry={reload} />
      ) : filtered.length === 0 ? (
        search ? (
          <EmptyState icon={FileText} title="No matching prompts" action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}>
            Nothing contains “{search}”.
          </EmptyState>
        ) : (
          <EmptyState icon={FileText} title="No prompts yet">{copy.empty}</EmptyState>
        )
      ) : (
        <RowList label={copy.title}>
          {filtered.map((p) => (
            <ListRow key={p.id} selected={p.id === selectedId} onSelect={() => { if (p.id !== selectedId) guard(() => select(p.id)); }}>
              {hasImage && (
                p.thumb ? (
                  <img src={p.thumb} alt="" width={56} height={40} loading="lazy" className="h-10 w-14 shrink-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-subtle)] object-cover" />
                ) : (
                  <span className="h-10 w-14 shrink-0 rounded-md bg-[var(--bg-subtle)]" />
                )
              )}
              <span className="line-clamp-2 min-w-0 flex-1 text-sm text-[var(--text-primary)]">{p.report}</span>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  let detail;
  if (selectedId === "new") {
    detail = (
      <DetailView
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button>
            <Button onClick={add} loading={adding} disabled={uploading}>
              {adding ? "Adding…" : "Add prompt"}
            </Button>
          </>
        }
      >
        <DetailHeader title={`New ${copy.singular}`} meta={hasImage ? "Students describe this chart or diagram." : "Students write an essay answering this question."} />
        <div className="mt-6 flex flex-col gap-5">
          {hasImage && (
            <Field label="Chart or diagram" hint="Use a chart you made yourself. A scan from a Cambridge IELTS book or another publisher is their copyright, and publishing it here is an infringement.">
              {newImage ? (
                <div className="flex flex-col items-start gap-3">
                  <ChartPreview src={newImage} pdfHeight="h-72" className="max-h-72 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] object-contain" />
                  <FileButton accept="image/*,application/pdf" onFile={(f) => uploadTo(f, (full, thumb) => { setNewImage(full); setNewThumb(thumb); })} disabled={uploading}>
                    {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                    {uploading ? "Preparing…" : "Choose another image"}
                  </FileButton>
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] px-6 py-10 text-center">
                  <ImagePlus size={24} className="mb-3 text-[var(--text-secondary)]" aria-hidden="true" />
                  <p className="text-sm text-[var(--text-secondary)]">PNG, JPG or PDF of the chart students will describe.</p>
                  <FileButton accept="image/*,application/pdf" onFile={(f) => uploadTo(f, (full, thumb) => { setNewImage(full); setNewThumb(thumb); })} disabled={uploading} className="mt-4">
                    {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                    {uploading ? "Preparing…" : "Choose image"}
                  </FileButton>
                </div>
              )}
            </Field>
          )}
          <Field label="Question" htmlFor="new-prompt-text">
            <Textarea name="new-prompt-text" autoComplete="off" id="new-prompt-text" rows={hasImage ? 5 : 8} value={newReport} onChange={(e) => setNewReport(e.target.value)} />
          </Field>
          {newError && <Notice tone="error">{newError}</Notice>}
        </div>
      </DetailView>
    );
  } else if (selected) {
    const index = list.findIndex((p) => p.id === selected.id);
    detail = (
      <DetailView
        footer={
          dirty ? (
            <>
              <Button variant="ghost" onClick={() => select(selected.id)}>Discard changes</Button>
              <Button onClick={save} loading={saving} disabled={uploading || !draftReport.trim()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : undefined
        }
      >
        <DetailHeader
          title={copy.singular}
          meta={`Number ${index + 1} of ${list.length}, newest first`}
          actions={
            <Button variant="dangerOutline" size="sm" onClick={remove}>
              <Trash2 aria-hidden="true" /> Delete
            </Button>
          }
        />
        {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}
        <div className="mt-6 flex flex-col gap-5">
          {hasImage && (
            <Field label="Chart or diagram" hint="Use a chart you made yourself. A scan from a Cambridge IELTS book or another publisher is their copyright, and publishing it here is an infringement.">
              <div className="flex flex-col items-start gap-3">
                {draftImage && (
                  <button
                    type="button"
                    onClick={() => setPreview(draftImage)}
                    className="w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    aria-label="Open the image at full size"
                  >
                    <ChartPreview src={draftImage} pdfHeight="h-80" className="max-h-80 w-full object-contain" />
                  </button>
                )}
                <FileButton accept="image/*,application/pdf" onFile={(f) => uploadTo(f, (full, thumb) => { setDraftImage(full); setDraftThumb(thumb); })} disabled={uploading}>
                  {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                  {uploading ? "Preparing…" : "Replace image"}
                </FileButton>
              </div>
            </Field>
          )}
          <Field label="Question" htmlFor="prompt-text">
            <Textarea name="prompt-text" autoComplete="off" id="prompt-text" rows={hasImage ? 5 : 9} value={draftReport} onChange={(e) => setDraftReport(e.target.value)} />
          </Field>
        </div>
      </DetailView>
    );
  } else {
    detail = (
      <EmptyState
        icon={FileText}
        title="Select a prompt"
        className="py-24"
        action={<Button variant="outline" onClick={startNew}><Plus aria-hidden="true" /> New {copy.singular}</Button>}
      >
        Choose a question on the left to read or edit it, or add a new one.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label={copy.title}
        list={listPane}
        detail={detail}
        detailOpen={selectedId !== null}
        onBack={() => guard(() => setSelectedId(null))}
        backLabel={copy.title}
        detailKey={selectedId ?? "none"}
      />
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-5xl p-3">
          <DialogTitle className="sr-only">Task 1 image</DialogTitle>
          {preview && <ChartPreview src={preview} pdfHeight="h-[82vh]" className="max-h-[82vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
