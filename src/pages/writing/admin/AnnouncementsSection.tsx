import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { ExternalLink, Gift, Lightbulb, Megaphone, Plus, Rocket, Trash2, Wrench, type LucideIcon } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
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

type Category = "announcement" | "update" | "maintenance" | "tip" | "offer";

interface Announcement {
  id: string;
  title: string;
  text: string;
  category: Category;
  link: string;
  linkLabel: string;
  active: boolean;
  createdAt?: string;
}

const CATEGORIES: Record<Category, { label: string; icon: LucideIcon; tint: string }> = {
  announcement: { label: "Announcement", icon: Megaphone, tint: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  update: { label: "Update", icon: Rocket, tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  maintenance: { label: "Maintenance", icon: Wrench, tint: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  tip: { label: "Tip", icon: Lightbulb, tint: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  offer: { label: "Offer", icon: Gift, tint: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
};

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
  const [category, setCategory] = useState<Category>("announcement");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
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

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") setSelectedId("new");
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const publish = async () => {
    if (!title.trim() || !text.trim()) {
      setFormError("Add a title and a message.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const ref = await addDoc(collection(db, "announcements"), {
        title: title.trim(),
        text: text.trim(),
        category,
        link: link.trim(),
        linkLabel: linkLabel.trim(),
        active: true,
        createdAt: new Date(),
      });
      setTitle(""); setText(""); setCategory("announcement"); setLink(""); setLinkLabel("");
      await load();
      setSelectedId(ref.id);
    } catch (e) {
      console.error(e);
      setFormError("Could not publish the announcement. Try again.");
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
  };

  const selected = items.find((a) => a.id === selectedId) ?? null;
  const activeCount = items.filter((a) => a.active).length;
  const q = search.trim().toLowerCase();
  const shown = items.filter((a) => !q || a.title.toLowerCase().includes(q) || a.text.toLowerCase().includes(q));

  const listPane = (
    <ListPane
      title="Announcements"
      count={items.length}
      action={<Button size="sm" onClick={() => setSelectedId("new")}><Plus aria-hidden="true" /> New</Button>}
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search announcements" label="Search announcements" inputRef={searchRef} />
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
            <ListRow key={a.id} selected={a.id === selectedId} onSelect={() => setSelectedId(a.id)}>
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
  if (selectedId === "new") {
    detail = (
      <DetailView
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button>
            <Button onClick={publish} loading={saving}>{saving ? "Publishing…" : "Publish"}</Button>
          </>
        }
      >
        <DetailHeader title="New announcement" meta="Students see it as soon as you publish. You can hide it again at any time." />
        <div className="mt-6 flex flex-col gap-5">
          <Field label="Type">
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORIES) as Category[]).map((c) => {
                const { label, icon: Icon } = CATEGORIES[c];
                const on = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCategory(c)}
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
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Message" htmlFor="ann-text">
            <Textarea id="ann-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Link" htmlFor="ann-link" optional hint="Where the button takes students.">
              <Input id="ann-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
            </Field>
            <Field label="Button text" htmlFor="ann-link-label" optional>
              <Input id="ann-link-label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            </Field>
          </div>
          {formError && <Notice tone="error">{formError}</Notice>}
        </div>
      </DetailView>
    );
  } else if (selected) {
    const cat = CATEGORIES[selected.category] ?? CATEGORIES.announcement;
    detail = (
      <DetailView>
        <DetailHeader
          leading={<CategoryIcon category={selected.category} size={44} />}
          title={selected.title || cat.label}
          badges={<Badge variant={selected.active ? "success" : "secondary"}>{selected.active ? "Showing" : "Hidden"}</Badge>}
          meta={`${cat.label}${selected.createdAt ? `, posted ${formatDate(selected.createdAt)}` : ""}`}
          actions={<Button variant="dangerOutline" size="sm" onClick={() => remove(selected)}><Trash2 aria-hidden="true" /> Delete</Button>}
        />
        <p className="mt-6 max-w-[65ch] whitespace-pre-line text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">{selected.text}</p>
        {selected.link && (
          <a
            href={selected.link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-blue)] underline underline-offset-2"
          >
            {selected.linkLabel || selected.link} <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
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
        action={<Button variant="outline" onClick={() => setSelectedId("new")}><Plus aria-hidden="true" /> New announcement</Button>}
      >
        Choose one on the left to read, hide or delete it, or post a new one.
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
        onBack={() => setSelectedId(null)}
        backLabel="All announcements"
        detailKey={selectedId ?? "none"}
      />
      {dialog}
    </>
  );
}
