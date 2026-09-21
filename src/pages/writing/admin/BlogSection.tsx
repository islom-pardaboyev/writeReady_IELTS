import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { ExternalLink, Newspaper, Plus, Sparkles, Trash2 } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { deleteBlogPost, getBlogPostById, getBlogPosts, saveBlogPost, updateBlogPost } from "@/firebase/blog";
import type { BlogPost } from "@/types/blog";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichEditor } from "@/components/ui/RichEditor";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection } from "@/components/staff/ListDetail";
import { EmptyState, Field, FilterChips, Notice, RowSkeletons, SearchField, selectClass } from "@/components/staff/parts";
import { formatDate } from "./format";
import type { SectionProps } from "./types";

interface PostRow {
  id: string;
  title: string;
  slug: string;
  status: BlogPost["status"];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: Date | null;
}

type Filter = "all" | "published" | "draft";

const CATEGORIES: BlogPost["category"][] = ["Writing tips", "Vocabulary", "Band score", "Grammar", "News"];

const STATUS_BADGE: Record<BlogPost["status"], { label: string; variant: "success" | "secondary" | "warning" }> = {
  published: { label: "Published", variant: "success" },
  draft: { label: "Draft", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "warning" },
};

const blankPost = (): Partial<BlogPost> => ({
  title: "", slug: "", excerpt: "", content: "", featuredImage: "",
  category: "Writing tips", tags: [], status: "draft", author: "WriteReady Team",
  seo: { metaTitle: "", metaDescription: "", focusKeyword: "" },
  viewCount: 0, likeCount: 0, commentCount: 0, publishedAt: null,
});

const slugify = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function BlogSection({ intent, clearIntent }: SectionProps) {
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Partial<BlogPost> | null>(null);
  const [original, setOriginal] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getBlogPosts(undefined, db);
      setPosts(all.map((p) => ({
        id: p.id, title: p.title, slug: p.slug, status: p.status,
        viewCount: p.viewCount, likeCount: p.likeCount, commentCount: p.commentCount, publishedAt: p.publishedAt,
      })));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = !!editor && JSON.stringify(editor) !== original;

  const open = async (id: string | null) => {
    if (dirty && !(await confirm("You have unsaved changes to this post. Discard them?", { title: "Discard changes?", confirmLabel: "Discard" }))) return;
    setSelectedId(id);
    setNotice(null);
    setAiTopic("");
    if (id === null) { setEditor(null); setOriginal(""); return; }
    if (id === "new") {
      const p = blankPost();
      setEditor(p);
      setOriginal(JSON.stringify(p));
      return;
    }
    setEditor(null);
    setEditorLoading(true);
    try {
      const full = await getBlogPostById(id, db);
      setEditor(full);
      setOriginal(JSON.stringify(full));
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not open this post. Try again." });
    }
    setEditorLoading(false);
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") open("new");
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const counts = useMemo(() => ({
    all: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status !== "published").length,
  }), [posts]);

  const filtered = posts
    .filter((p) => filter === "all" || (filter === "published" ? p.status === "published" : p.status !== "published"))
    .filter((p) => !search.trim() || p.title.toLowerCase().includes(search.trim().toLowerCase()));

  const set = (patch: Partial<BlogPost>) => setEditor((p) => ({ ...p, ...patch }));
  const setSeo = (patch: Partial<BlogPost["seo"]>) =>
    setEditor((p) => ({ ...p, seo: { metaTitle: "", metaDescription: "", focusKeyword: "", ...p?.seo, ...patch } }));

  const generate = async () => {
    if (!editor || !aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Write a 600-800 word blog post body for IELTS learners about: ${aiTopic}. Focus keyword: ${editor.seo?.focusKeyword || aiTopic}. Write in markdown with clear headings (##), short paragraphs. Topic: ${editor.title || aiTopic}`,
          }],
        }),
      });
      const json = (await res.json()) as { reply?: string };
      set({ content: json.reply ?? "" });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "The AI draft failed. Try again." });
    }
    setAiLoading(false);
  };

  const save = async () => {
    if (!editor) return;
    if (!editor.title?.trim()) { setNotice({ tone: "error", text: "Give the post a title first." }); return; }
    const before = original ? (JSON.parse(original) as Partial<BlogPost>).status : undefined;
    if (editor.status === "published" && (!editor.id || before !== "published")) {
      const ok = await confirm(
        `Publish "${editor.title.trim()}"? It goes live on the blog and every student gets a notification.`,
        { title: "Publish post?", confirmLabel: "Publish and notify" },
      );
      if (!ok) return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const postData: Omit<BlogPost, "id"> = {
        title: editor.title ?? "",
        slug: editor.slug ?? "",
        excerpt: editor.excerpt ?? "",
        content: editor.content ?? "",
        featuredImage: editor.featuredImage ?? "",
        category: editor.category ?? "Writing tips",
        tags: editor.tags ?? [],
        seo: editor.seo ?? { metaTitle: "", metaDescription: "", focusKeyword: "" },
        status: editor.status ?? "draft",
        publishedAt: editor.status === "published" ? new Date() : null,
        author: editor.author ?? "WriteReady Team",
        ctaText: editor.ctaText ?? "",
        ctaLink: editor.ctaLink ?? "",
        viewCount: editor.viewCount ?? 0,
        likeCount: editor.likeCount ?? 0,
        commentCount: editor.commentCount ?? 0,
      };
      const wasPublished = postData.status === "published";
      const originalStatus = original ? (JSON.parse(original) as Partial<BlogPost>).status : undefined;
      const wasAlreadyPublished = !!editor.id && originalStatus === "published";
      let id = editor.id;
      if (id) await updateBlogPost(id, postData, db);
      else id = await saveBlogPost(postData, db);
      if (wasPublished && !wasAlreadyPublished) {
        const usersSnap = await getDocs(collection(db, "users"));
        // Students read this in Uzbek on the site.
        const preview = `📝 Yangi maqola: "${postData.title}"`;
        await Promise.all(usersSnap.docs.map((u) =>
          addDoc(collection(db, "notifications", u.id, "items"), {
            type: "new_post",
            fromUserName: "WriteReady",
            postSlug: postData.slug,
            preview,
            read: false,
            createdAt: new Date(),
          }),
        ));
      }
      await load();
      const saved = { ...postData, id };
      setEditor(saved);
      setOriginal(JSON.stringify(saved));
      setSelectedId(id);
      setNotice({ tone: "success", text: wasPublished && !wasAlreadyPublished ? "Published. Students were notified." : "Post saved." });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not save the post. Try again." });
    }
    setSaving(false);
  };

  const remove = async (id: string, title: string) => {
    if (!(await confirm(`Delete "${title || "this post"}"? It disappears from the blog. This cannot be undone.`, { title: "Delete post?", destructive: true, confirmLabel: "Delete post" }))) return;
    await deleteBlogPost(id, db);
    setEditor(null);
    setOriginal("");
    setSelectedId(null);
    await load();
  };

  const listPane = (
    <ListPane
      title="Blog"
      count={posts.length}
      action={<Button size="sm" onClick={() => open("new")}><Plus aria-hidden="true" /> New</Button>}
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search posts…" label="Search blog posts" inputRef={searchRef} />
          <FilterChips
            label="Filter posts"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: counts.all },
              { id: "published", label: "Published", count: counts.published },
              { id: "draft", label: "Drafts", count: counts.draft },
            ]}
          />
        </>
      }
    >
      {loading && posts.length === 0 ? (
        <RowSkeletons />
      ) : loadError ? (
        <EmptyState icon={Newspaper} title="Could not load posts" action={<Button variant="outline" size="sm" onClick={load}>Try again</Button>}>
          The database refused the request. Check the Firestore rules for blogPosts.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Newspaper} title={posts.length ? "No posts match" : "No posts yet"}>
          {posts.length ? "Try another search or filter." : "Write the first article for the WriteReady blog."}
        </EmptyState>
      ) : (
        <RowList label="Blog posts">
          {filtered.map((p) => {
            const st = STATUS_BADGE[p.status] ?? STATUS_BADGE.draft;
            return (
              <ListRow key={p.id} selected={p.id === selectedId} onSelect={() => { if (p.id !== selectedId) open(p.id); }}>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">{p.title || "Untitled post"}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <Badge variant={st.variant} className="text-[0.7rem]">{st.label}</Badge>
                    {p.publishedAt && <span>{formatDate(p.publishedAt)}</span>}
                    {p.status === "published" && <span className="tabular-nums">{p.viewCount} views</span>}
                  </p>
                </div>
              </ListRow>
            );
          })}
        </RowList>
      )}
    </ListPane>
  );

  let detail;
  if (editorLoading) {
    detail = <div className="mx-auto max-w-[820px] px-6 py-8 lg:px-10"><RowSkeletons rows={5} /></div>;
  } else if (editor) {
    const isNew = !editor.id;
    const st = STATUS_BADGE[editor.status ?? "draft"];
    const originalStatus = original ? (JSON.parse(original) as Partial<BlogPost>).status : undefined;
    const willPublish = editor.status === "published" && (isNew || originalStatus !== "published");
    detail = (
      <DetailView
        footer={
          <>
            {dirty && <span className="mr-auto text-sm text-[var(--text-secondary)]">Unsaved changes</span>}
            <Button variant="ghost" onClick={() => open(null)}>{isNew ? "Cancel" : "Close"}</Button>
            <Button onClick={save} loading={saving} disabled={!dirty && !isNew}>
              {saving ? "Saving…" : willPublish ? "Publish and notify students" : "Save"}
            </Button>
          </>
        }
      >
        <DetailHeader
          title={editor.title || (isNew ? "New post" : "Untitled post")}
          badges={<Badge variant={st.variant}>{st.label}</Badge>}
          meta={
            isNew ? "Draft posts stay hidden until you set the status to Published." :
            `${editor.viewCount ?? 0} views, ${editor.likeCount ?? 0} likes, ${editor.commentCount ?? 0} comments`
          }
          actions={
            !isNew && (
              <>
                {editor.status === "published" && editor.slug && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/blog/${editor.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> View</a>
                  </Button>
                )}
                <Button variant="dangerOutline" size="sm" onClick={() => remove(editor.id!, editor.title ?? "")}><Trash2 aria-hidden="true" /> Delete</Button>
              </>
            )
          }
        />
        {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Title" htmlFor="b-title" className="sm:col-span-2">
            <Input name="b-title" autoComplete="off" id="b-title" value={editor.title ?? ""} onChange={(e) => set({ title: e.target.value, slug: slugify(e.target.value) })} />
          </Field>
          <Field label="Web address" htmlFor="b-slug" hint={`writeready.uz/blog/${editor.slug || "…"}`}>
            <Input name="b-slug" autoComplete="off" id="b-slug" value={editor.slug ?? ""} onChange={(e) => set({ slug: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Status" htmlFor="b-status">
            <select name="b-status" autoComplete="off" id="b-status" className={selectClass} value={editor.status ?? "draft"} onChange={(e) => set({ status: e.target.value as BlogPost["status"] })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </Field>
          <Field label="Summary" htmlFor="b-excerpt" className="sm:col-span-2" hint="Shown on the blog list and in search results.">
            <Textarea name="b-excerpt" autoComplete="off" id="b-excerpt" rows={3} value={editor.excerpt ?? ""} onChange={(e) => set({ excerpt: e.target.value })} />
          </Field>
        </div>

        <DetailSection title="Article">
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] p-4">
            <Field label="Draft the article with AI" htmlFor="b-ai" className="min-w-[220px] flex-1" hint="Replaces the text below with a first draft.">
              <Input name="b-ai" autoComplete="off" id="b-ai" placeholder="Topic, e.g. linking words for Task 2…" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} />
            </Field>
            <Button variant="outline" onClick={generate} loading={aiLoading} disabled={!aiTopic.trim()} className="mb-5">
              <Sparkles aria-hidden="true" /> {aiLoading ? "Writing…" : "Generate"}
            </Button>
          </div>
          <RichEditor value={editor.content ?? ""} onChange={(html) => set({ content: html })} />
        </DetailSection>

        <DetailSection title="Details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" htmlFor="b-category">
              <select name="b-category" autoComplete="off" id="b-category" className={selectClass} value={editor.category ?? "Writing tips"} onChange={(e) => set({ category: e.target.value as BlogPost["category"] })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Author" htmlFor="b-author">
              <Input name="b-author" autoComplete="off" id="b-author" value={editor.author ?? "WriteReady Team"} onChange={(e) => set({ author: e.target.value })} />
            </Field>
            <Field label="Cover image URL" htmlFor="b-image" optional className="sm:col-span-2" hint="Only use a picture you own or that is licensed for reuse — the address is loaded straight from that site, so its owner sees the traffic. Unsplash, Pexels and Wikimedia Commons are safe sources.">
              <Input name="b-image" autoComplete="off" id="b-image" type="url" placeholder="https://example.com…" value={editor.featuredImage ?? ""} onChange={(e) => set({ featuredImage: e.target.value })} />
            </Field>
            <Field label="Call-to-action text" htmlFor="b-cta" optional>
              <Input name="b-cta" autoComplete="off" id="b-cta" value={editor.ctaText ?? ""} onChange={(e) => set({ ctaText: e.target.value })} />
            </Field>
            <Field label="Call-to-action link" htmlFor="b-cta-link" optional>
              <Input name="b-cta-link" autoComplete="off" id="b-cta-link" placeholder="https://example.com…" value={editor.ctaLink ?? ""} onChange={(e) => set({ ctaLink: e.target.value })} />
            </Field>
          </div>
        </DetailSection>

        <DetailSection title="Search engines" description="How the post appears on Google.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="SEO title" htmlFor="b-seo-title" optional>
              <Input name="b-seo-title" autoComplete="off" id="b-seo-title" value={editor.seo?.metaTitle ?? ""} onChange={(e) => setSeo({ metaTitle: e.target.value })} />
            </Field>
            <Field label="Focus keyword" htmlFor="b-seo-kw" optional>
              <Input name="b-seo-kw" autoComplete="off" id="b-seo-kw" value={editor.seo?.focusKeyword ?? ""} onChange={(e) => setSeo({ focusKeyword: e.target.value })} />
            </Field>
            <Field label="Meta description" htmlFor="b-seo-desc" optional className="sm:col-span-2">
              <Textarea name="b-seo-desc" autoComplete="off" id="b-seo-desc" rows={2} value={editor.seo?.metaDescription ?? ""} onChange={(e) => setSeo({ metaDescription: e.target.value })} />
            </Field>
          </div>
        </DetailSection>
      </DetailView>
    );
  } else {
    detail = notice ? (
      <div className="mx-auto max-w-[820px] px-6 py-8 lg:px-10"><Notice tone={notice.tone}>{notice.text}</Notice></div>
    ) : (
      <EmptyState
        icon={Newspaper}
        title="Select a post"
        className="py-24"
        action={<Button variant="outline" onClick={() => open("new")}><Plus aria-hidden="true" /> New post</Button>}
      >
        Choose a post on the left to edit it, or start a new one.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label="Blog posts"
        list={listPane}
        detail={detail}
        detailOpen={selectedId !== null}
        onBack={() => open(null)}
        backLabel="All posts"
        detailKey={selectedId ?? "none"}
      />
      {dialog}
    </>
  );
}
