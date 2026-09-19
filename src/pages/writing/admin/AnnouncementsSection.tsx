import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { ArrowRight, ExternalLink, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { adminDb as db } from "@/firebase/adminConfig";
import type { AnnouncementCategory as Category } from "@/firebase/firestore";
import { ANNOUNCEMENT_CATEGORIES as CATEGORIES, sitePath } from "@/lib/announcements";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection } from "@/components/staff/ListDetail";
import { EmptyState, Field, LoadError, Notice, RowSkeletons, SearchField, Switch } from "@/components/staff/parts";
import { formatDate } from "./format";
import type { SectionProps } from "./types";

interface Announcement {
  id: string;
  title: string;
  text: string;
  category: Category;
  link: string;
  linkLabel: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** What the form edits: a new announcement (no id) or an existing one. */
interface Draft {
  id?: string;
  category: Category;
  title: string;
  text: string;
  link: string;
  linkLabel: string;
}

const EMPTY_DRAFT: Draft = { category: "announcement", title: "", text: "", link: "", linkLabel: "" };

const draftOf = (a: Announcement): Draft => ({
  id: a.id,
  category: a.category,
  title: a.title,
  text: a.text,
  link: a.link,
  linkLabel: a.linkLabel,
});

const sameDraft = (a: Draft, b: Draft) =>
  a.category === b.category &&
  a.title.trim() === b.title.trim() &&
  a.text.trim() === b.text.trim() &&
  a.link.trim() === b.link.trim() &&
  a.linkLabel.trim() === b.linkLabel.trim();

function CategoryIcon({ category, size = 36 }: { category: Category; size?: number }) {
  const c = CATEGORIES[category] ?? CATEGORIES.announcement;
  const Icon = c.icon;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg", c.tint)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.48)} aria-hidden="true" />
    </span>
  );
}

export function AnnouncementsSection({ intent, clearIntent }: SectionProps) {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
      setItems(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? "",
          text: data.text ?? "",
          category: data.category ?? "announcement",
          link: data.link ?? "",
          linkLabel: data.linkLabel ?? "",
          active: data.active ?? false,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString?.(),
        };
      }));
      setLoadFailed(false);
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const original = draft?.id ? items.find((a) => a.id === draft.id) : undefined;
  const dirty = draft !== null && !sameDraft(draft, original ? draftOf(original) : EMPTY_DRAFT);

  // Leaving the form with unsaved edits asks first.
  const leaveForm = async () =>
    !dirty ||
    confirm("Your changes to this announcement haven't been saved.", {
      title: "Discard changes?",
      confirmLabel: "Discard",
      destructive: true,
    });

  const select = async (id: string | null) => {
    if (!(await leaveForm())) return;
    setSelectedId(id);
    setDraft(id === "new" ? { ...EMPTY_DRAFT } : null);
    setFormError("");
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") {
      setSelectedId("new");
      setDraft({ ...EMPTY_DRAFT });
    }
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.text.trim()) {
      setFormError("Add a title and a message.");
      return;
    }
    const fields = {
      title: draft.title.trim(),
      text: draft.text.trim(),
      category: draft.category,
      link: draft.link.trim(),
      linkLabel: draft.linkLabel.trim(),
    };
    setSaving(true);
    setFormError("");
    try {
      if (draft.id) {
        const id = draft.id;
        const updatedAt = new Date();
        await updateDoc(doc(db, "announcements", id), { ...fields, updatedAt });
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...fields, updatedAt: updatedAt.toISOString() } : x)));
        setDraft(null);
      } else {
        const ref = await addDoc(collection(db, "announcements"), { ...fields, active: true, createdAt: new Date() });
        await load();
        setDraft(null);
        setSelectedId(ref.id);
      }
    } catch (e) {
      console.error(e);
      setFormError(draft.id ? "Could not save your changes. Try again." : "Could not publish the announcement. Try again.");
    }
    setSaving(false);
  };

  const setActive = async (a: Announcement, active: boolean) => {
    await updateDoc(doc(db, "announcements", a.id), { active });
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, active } : x)));
  };

  const remove = async (a: Announcement) => {
    if (!(await confirm(`Delete "${a.title || "this announcement"}"? Students will no longer see it.`, { title: "Delete announcement?", destructive: true, confirmLabel: "Delete" }))) return;
    await deleteDoc(doc(db, "announcements", a.id));
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    setSelectedId(null);
    setDraft(null);
  };

  const selected = items.find((a) => a.id === selectedId) ?? null;
  const activeCount = items.filter((a) => a.active).length;
  const q = search.trim().toLowerCase();
  const shown = items.filter((a) => !q || a.title.toLowerCase().includes(q) || a.text.toLowerCase().includes(q));

  const listPane = (
    <ListPane
      title="Announcements"
      count={items.length}
      action={<Button size="sm" onClick={() => select("new")}><Plus aria-hidden="true" /> New</Button>}
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search announcements…" label="Search announcements" inputRef={searchRef} />
          <p className="text-sm text-[var(--text-secondary)]">{activeCount === 0 ? "None showing to students right now." : `${activeCount} showing to students.`}</p>
        </>
      }
    >
      {loading && items.length === 0 ? (
        <RowSkeletons />
      ) : loadFailed && items.length === 0 ? (
        <LoadError what="announcements" onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet">Post news, updates or offers that students see when they open the site.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements match" action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}>
          Nothing contains “{search}”.
        </EmptyState>
      ) : (
        <RowList label="Announcements">
          {shown.map((a) => (
            <ListRow key={a.id} selected={a.id === selectedId} onSelect={() => { if (a.id !== selectedId) select(a.id); }}>
              <CategoryIcon category={a.category} size={32} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", a.active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{a.title || a.text}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                  {a.active ? "Showing" : "Hidden"}{a.createdAt ? ` · ${formatDate(a.createdAt)}` : ""}
                </p>
              </div>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  let detail;
  if (draft) {
    const isNew = !draft.id;
    detail = (
      <DetailView
        footer={
          <>
            <Button variant="ghost" onClick={() => (isNew ? select(null) : setDraft(null))}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!isNew && !dirty}>
              {saving ? (isNew ? "Publishing…" : "Saving…") : isNew ? "Publish" : "Save changes"}
            </Button>
          </>
        }
      >
        <DetailHeader
          title={isNew ? "New announcement" : "Edit announcement"}
          meta={
            isNew
              ? "Students see it as soon as you publish. You can hide it again at any time."
              : "Changes show the next time students open the site. Students who already closed it won't get it again."
          }
        />
        <div className="mt-6 flex flex-col gap-5">
          <Field label="Type">
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORIES) as Category[]).map((c) => {
                const { label, icon: Icon } = CATEGORIES[c];
                const on = c === draft.category;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ category: c })}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      on ? "border-[var(--ink-blue)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" /> {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Title" htmlFor="ann-title">
            <Input name="ann-title" autoComplete="off" id="ann-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Message" htmlFor="ann-text" hint="Leave a blank line between paragraphs.">
            <Textarea name="ann-text" autoComplete="off" id="ann-text" rows={5} value={draft.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Link" htmlFor="ann-link" optional hint="A page on this site, like /account, or a full web address.">
              <Input name="ann-link" autoComplete="off" id="ann-link" inputMode="url" spellCheck={false} placeholder="/account or https://…" value={draft.link} onChange={(e) => set({ link: e.target.value })} />
            </Field>
            <Field label="Button text" htmlFor="ann-link-label" optional>
              <Input name="ann-link-label" autoComplete="off" id="ann-link-label" placeholder="Learn more" value={draft.linkLabel} onChange={(e) => set({ linkLabel: e.target.value })} />
            </Field>
          </div>
          {formError && <Notice tone="error">{formError}</Notice>}
        </div>
      </DetailView>
    );
  } else if (selected) {
    const cat = CATEGORIES[selected.category] ?? CATEGORIES.announcement;
    const posted = formatDate(selected.createdAt);
    const edited = formatDate(selected.updatedAt);
    const path = selected.link ? sitePath(selected.link) : null;
    detail = (
      <DetailView>
        <DetailHeader
          leading={<CategoryIcon category={selected.category} size={44} />}
          title={selected.title || cat.label}
          badges={<Badge variant={selected.active ? "success" : "secondary"}>{selected.active ? "Showing" : "Hidden"}</Badge>}
          meta={`${cat.label}${posted ? `, posted ${posted}` : ""}${edited ? `, edited ${edited}` : ""}`}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDraft(draftOf(selected)); setFormError(""); }}>
                <Pencil aria-hidden="true" /> Edit
              </Button>
              <Button variant="dangerOutline" size="sm" onClick={() => remove(selected)}><Trash2 aria-hidden="true" /> Delete</Button>
            </div>
          }
        />
        <p className="mt-6 max-w-[65ch] whitespace-pre-line text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">{selected.text}</p>
        {selected.link && (path ? (
          <Link
            to={path}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-blue)] underline underline-offset-2"
          >
            {selected.linkLabel || "Learn more"} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <a
            href={selected.link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-blue)] underline underline-offset-2"
          >
            {selected.linkLabel || selected.link} <ExternalLink size={14} aria-hidden="true" />
          </a>
        ))}
        <DetailSection title="Visibility">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-color)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Show to students</p>
              <p className="text-sm text-[var(--text-secondary)]">Turn off to hide it without deleting it.</p>
            </div>
            <Switch checked={selected.active} onChange={(v) => setActive(selected, v)} label="Show to students" />
          </div>
        </DetailSection>
      </DetailView>
    );
  } else {
    detail = (
      <EmptyState
        icon={Megaphone}
        title="Select an announcement"
        className="py-24"
        action={<Button variant="outline" onClick={() => select("new")}><Plus aria-hidden="true" /> New announcement</Button>}
      >
        Choose one on the left to read, edit, hide or delete it, or post a new one.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label="Announcements"
        list={listPane}
        detail={detail}
        detailOpen={selectedId !== null}
        onBack={() => select(null)}
        backLabel="All announcements"
        detailKey={draft ? `${selectedId ?? "none"}:form` : selectedId ?? "none"}
      />
      {dialog}
    </>
  );
}
