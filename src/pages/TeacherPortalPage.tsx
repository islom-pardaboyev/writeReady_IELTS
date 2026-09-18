import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { CircleCheck, Download, FileText, Inbox, Loader2, RefreshCw, Upload, Wallet } from "lucide-react";
import { adminAuth, adminDb } from "@/firebase/adminConfig";
import { getHumanReviewsForTeacher, teacherEarningUZS, uploadTeacherFeedback } from "@/firebase/teachers";
import { buildReviewDocx, downloadBlob, fileToBase64 } from "@/lib/reviewDocx";
import type { HumanReview } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { StaffShell, type StaffNavGroup } from "@/components/staff/StaffShell";
import { StaffLogin } from "@/components/staff/StaffLogin";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection, KeyValues } from "@/components/staff/ListDetail";
import { EmptyState, FileButton, FilterChips, LoadError, Notice, PageHeading, Panel, RowSkeletons, SearchField, StatStrip } from "@/components/staff/parts";
import { formatDate, timeAgo, uzs } from "@/pages/writing/admin/format";

type Section = "reviews" | "earnings";
type Filter = "pending" | "checked" | "all";

const MODE_LABEL: Record<HumanReview["mode"], string> = { mock: "Mock exam", practice: "Practice", quick: "Quick write", relax: "Relax" };

const tasksOf = (r: HumanReview) => [r.task1 && "Task 1", r.task2 && "Task 2"].filter(Boolean).join(" and ");

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

export default function TeacherPortalPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [section, setSection] = useState<Section>("reviews");

  const [reviews, setReviews] = useState<HumanReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("teacherLoggedIn");
    const id = localStorage.getItem("teacherId");
    const name = localStorage.getItem("teacherName");
    if (saved !== "true" || !id) return;
    // Firebase Auth persists the signed-in session across reloads on its
    // own; wait for it to report a real user before trusting the localStorage
    // flag, so Firestore queries never race ahead of the restored session.
    const unsub = onAuthStateChanged(adminAuth, (fbUser) => {
      if (fbUser) {
        setIsLoggedIn(true);
        setTeacherId(id);
        setTeacherName(name ?? "Teacher");
      }
    });
    return unsub;
  }, []);

  const loadReviews = useCallback(async (id: string) => {
    setReviewsLoading(true);
    try {
      const data = await getHumanReviewsForTeacher(id, adminDb);
      setReviews(data.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()));
      setReviewsFailed(false);
    } catch (e) {
      console.error(e);
      setReviewsFailed(true);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !teacherId) return;
    loadReviews(teacherId);
  }, [isLoggedIn, teacherId, loadReviews]);

  const login = async (loginValue: string, password: string): Promise<string | null> => {
    try {
      // Credential check happens server-side (api/staff-login.ts) via the
      // Firebase Admin SDK, so the teacher's password never reaches the
      // browser. It mints a custom token for this teacher's own Firebase
      // account, giving a real authenticated session for their reviews.
      const res = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "teacher", login: loginValue, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) return "This account is turned off. Ask the WriteReady admin to turn it back on.";
        return res.status >= 500 ? "The sign-in service had a problem. Try again in a minute." : "That login or password is not right.";
      }
      await signInWithCustomToken(adminAuth, data.customToken);
      localStorage.setItem("teacherLoggedIn", "true");
      localStorage.setItem("teacherId", data.teacherId);
      localStorage.setItem("teacherName", data.teacherName);
      setTeacherId(data.teacherId);
      setTeacherName(data.teacherName);
      setIsLoggedIn(true);
      return null;
    } catch (err) {
      console.error(err);
      return "Could not reach the server. Check your connection and try again.";
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("teacherLoggedIn");
    localStorage.removeItem("teacherId");
    localStorage.removeItem("teacherName");
    await signOut(adminAuth).catch(() => {});
    setIsLoggedIn(false);
    setReviews([]);
    setSelectedId(null);
  };

  const handleDownload = async (review: HumanReview) => {
    setNotice(null);
    setBusy("download");
    try {
      const blob = await buildReviewDocx(review);
      downloadBlob(blob, `${review.studentName.replace(/\s+/g, "_")}_essay.docx`);
    } catch (err) {
      console.error(err);
      setNotice({ tone: "error", text: "Could not create the Word file. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (review: HumanReview, file: File) => {
    setNotice(null);
    setBusy("upload");
    try {
      const base64 = await fileToBase64(file);
      await uploadTeacherFeedback(review.id, base64, file.name, adminDb);
      await loadReviews(teacherId);
      setNotice({ tone: "success", text: `Feedback sent to ${review.studentName} (${file.name}). They were notified.` });
    } catch (err) {
      console.error(err);
      setNotice({ tone: "error", text: "Could not upload your feedback. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => ({
    pending: reviews.filter((r) => r.status === "pending").length,
    checked: reviews.filter((r) => r.status === "checked").length,
    all: reviews.length,
  }), [reviews]);

  const earnings = useMemo(() => {
    const byMonth = new Map<string, { count: number; total: number }>();
    reviews
      .filter((r) => r.status === "checked" && r.checkedAt)
      .forEach((r) => {
        const key = monthKey(r.checkedAt!);
        const entry = byMonth.get(key) ?? { count: 0, total: 0 };
        entry.count += 1;
        entry.total += teacherEarningUZS(r);
        byMonth.set(key, entry);
      });
    const rows = Array.from(byMonth.entries()).map(([month, v]) => ({ month, ...v })).sort((a, b) => b.month.localeCompare(a.month));
    const now = new Date();
    return {
      rows,
      thisMonth: byMonth.get(monthKey(now)) ?? { count: 0, total: 0 },
      lastMonth: byMonth.get(monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))) ?? { count: 0, total: 0 },
      total: rows.reduce((s, r) => s + r.total, 0),
    };
  }, [reviews]);

  if (!isLoggedIn) {
    return <StaffLogin title="Teacher sign-in" description="Review the essays students send you for Human Check." onSubmit={login} />;
  }

  const nav: StaffNavGroup<Section>[] = [
    {
      items: [
        { id: "reviews", label: "Reviews", icon: Inbox, badge: counts.pending || undefined },
        { id: "earnings", label: "Earnings", icon: Wallet },
      ],
    },
  ];

  const q = search.trim().toLowerCase();
  const filtered = reviews
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => !q || r.studentName.toLowerCase().includes(q) || (r.studentEmail ?? "").toLowerCase().includes(q));
  const selected = reviews.find((r) => r.id === selectedId) ?? null;

  const list = (
    <ListPane
      title="Reviews"
      action={
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadReviews(teacherId)} disabled={reviewsLoading} aria-label="Reload reviews" title="Reload reviews">
          <RefreshCw className={cn(reviewsLoading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search by student" label="Search reviews" inputRef={searchRef} />
          <FilterChips
            label="Filter reviews"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "pending", label: "Waiting", count: counts.pending },
              { id: "checked", label: "Checked", count: counts.checked },
              { id: "all", label: "All", count: counts.all },
            ]}
          />
        </>
      }
    >
      {reviewsLoading && reviews.length === 0 ? (
        <RowSkeletons />
      ) : reviewsFailed && reviews.length === 0 ? (
        <LoadError what="your reviews" onRetry={() => loadReviews(teacherId)} />
      ) : filtered.length === 0 && q ? (
        <EmptyState icon={Inbox} title="No reviews match" action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}>
          No student matches “{search}”.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={filter === "pending" ? CircleCheck : Inbox} title={filter === "pending" ? "Nothing waiting" : "No reviews here"}>
          {filter === "pending" ? "You have checked every essay sent to you. New requests appear here." : "Essays students send you for Human Check appear here."}
        </EmptyState>
      ) : (
        <RowList label="Reviews">
          {filtered.map((r) => (
            <ListRow key={r.id} selected={r.id === selectedId} onSelect={() => { setSelectedId(r.id); setNotice(null); }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{r.studentName}</span>
                  <Badge variant={r.status === "checked" ? "success" : "warning"} className="shrink-0 text-[0.7rem]">
                    {r.status === "checked" ? "Checked" : "Waiting"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{tasksOf(r)} · {timeAgo(r.requestedAt)}</p>
              </div>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  const detail = selected ? (
    <DetailView>
      <DetailHeader
        title={selected.studentName}
        badges={<Badge variant={selected.status === "checked" ? "success" : "warning"}>{selected.status === "checked" ? "Checked" : "Waiting for you"}</Badge>}
        meta={`${MODE_LABEL[selected.mode] ?? selected.mode}, ${tasksOf(selected)}`}
      />
      {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}

      <DetailSection title="1. Download the essay" description="A Word file with the question and the student's essay, ready for your comments.">
        <Button onClick={() => handleDownload(selected)} loading={busy === "download"} disabled={busy !== null}>
          {busy !== "download" && <Download aria-hidden="true" />}
          {busy === "download" ? "Preparing…" : "Download essay (.docx)"}
        </Button>
      </DetailSection>

      <DetailSection
        title="2. Upload your feedback"
        description={selected.status === "checked" ? "Uploading again replaces the file the student has now." : "Send back the marked-up Word file. The student is notified right away."}
      >
        <div className="flex flex-wrap items-center gap-3">
          <FileButton accept=".docx" onFile={(f) => handleUpload(selected, f)} disabled={busy !== null}>
            {busy === "upload" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            {busy === "upload" ? "Uploading…" : selected.status === "checked" ? "Replace feedback" : "Upload feedback (.docx)"}
          </FileButton>
          {selected.feedbackFileName && (
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <FileText size={14} aria-hidden="true" /> {selected.feedbackFileName}
            </span>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Request">
        <KeyValues
          items={[
            { label: "Student email", value: selected.studentEmail || "Not given" },
            { label: "Requested", value: `${formatDate(selected.requestedAt)} (${timeAgo(selected.requestedAt)})` },
            { label: "Checked", value: selected.checkedAt ? formatDate(selected.checkedAt) : "Not yet" },
            { label: "You earn", value: <span className="font-mono tabular-nums">{uzs(teacherEarningUZS(selected))}</span> },
          ]}
        />
      </DetailSection>
    </DetailView>
  ) : (
    <EmptyState icon={Inbox} title="Select an essay" className="py-24">
      {counts.pending ? `You have ${counts.pending} ${counts.pending === 1 ? "essay" : "essays"} waiting. Pick one on the left to download it and send your feedback.` : "Pick a review on the left to see it."}
    </EmptyState>
  );

  const earningsPage = (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6 lg:px-10">
      <PageHeading title="Earnings" description="What you earned for checked reviews, after the WriteReady fee." />
      <StatStrip
        items={[
          { label: "This month", value: earnings.thisMonth.total.toLocaleString("en-US"), hint: `UZS, ${earnings.thisMonth.count} ${earnings.thisMonth.count === 1 ? "review" : "reviews"}` },
          { label: "Last month", value: earnings.lastMonth.total.toLocaleString("en-US"), hint: `UZS, ${earnings.lastMonth.count} ${earnings.lastMonth.count === 1 ? "review" : "reviews"}` },
          { label: "All time", value: earnings.total.toLocaleString("en-US"), hint: `UZS, ${counts.checked} ${counts.checked === 1 ? "review" : "reviews"}` },
        ]}
      />
      <Panel title="By month" className="mt-6" bodyClassName="px-0 pb-0">
        {earnings.rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--text-secondary)]">No checked reviews yet. Your earnings appear here once you send feedback.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-y border-[var(--border-color)] bg-[var(--bg-subtle)] text-left text-[var(--text-secondary)]">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Month</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Reviews</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {earnings.rows.map((r) => (
                <tr key={r.month}>
                  <td className="px-5 py-3 text-[var(--text-primary)]">{monthLabel(r.month)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.count}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{uzs(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );

  return (
    <StaffShell
      role="Teacher"
      identity={{ name: teacherName, detail: "Teacher" }}
      nav={nav}
      active={section}
      onNavigate={setSection}
      onSignOut={handleLogout}
    >
      {section === "reviews" && (
        <ListDetail
          label="Reviews"
          list={list}
          detail={detail}
          detailOpen={selectedId !== null}
          onBack={() => setSelectedId(null)}
          backLabel="All reviews"
          detailKey={selectedId ?? "none"}
        />
      )}
      {section === "earnings" && earningsPage}
    </StaffShell>
  );
}
