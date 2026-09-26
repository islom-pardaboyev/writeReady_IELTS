import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BellOff, Eye, ImagePlus, Megaphone, PenLine, Send, Users, X, type LucideIcon } from "lucide-react";
import { adminAuth, adminDb } from "@/firebase/adminConfig";
import { getFeatureFlag, setFeatureFlag } from "@/hooks/useFeatureFlag";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, FileButton, FilterChips, LoadError, Notice, PageHeading, Panel, RowSkeletons, SearchField, StatStrip, Switch } from "@/components/staff/parts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAPTION_LIMIT, TEXT_LIMIT, postLength, postProblem, postToHtml } from "@shared/telegramText";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import { timeAgo } from "./format";

/**
 * Posts to every student who uses the Telegram bot (api/_lib/broadcast.ts,
 * through api/_lib/routes/botBroadcast.ts). A post goes to the admin's own
 * Telegram first; "Send to all" opens only for exactly what was tested.
 */

interface Audience { students: number; off: number; blocked: number; reach: number }

interface Progress { status: "sending" | "done"; total: number; sent: number; failed: number; blocked: number; skipped: number }

interface Sent extends Progress {
  id: string;
  text: string;
  hasPhoto: boolean;
  createdAt: number;
  finishedAt: number | null;
  active: boolean;
}

interface RunLine extends Partial<Progress> { final?: boolean; paused?: boolean; busy?: boolean; error?: string }

interface Photo { file: File; url: string }

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function api(body: Record<string, unknown>): Promise<Response> {
  const idToken = await adminAuth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Please sign in to the admin panel again.");
  return fetch("/api/bot-broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
}

async function errorOf(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Something went wrong (${res.status}).`;
}

/** Reads the server's progress, one JSON object per line, as it arrives. */
async function readLines(res: Response, onLine: (line: RunLine) => void): Promise<void> {
  if (!res.body) throw new Error("The server did not answer. Check the posts below in a minute.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) onLine(JSON.parse(line) as RunLine);
    }
    if (done) break;
  }
  if (buffer.trim()) onLine(JSON.parse(buffer) as RunLine);
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the picture."));
    reader.readAsDataURL(file);
  });

const num = (n: number) => n.toLocaleString("en-US");

function countsLine(p: Progress): string {
  const parts = [`${num(p.sent)} sent`];
  if (p.blocked) parts.push(`${num(p.blocked)} blocked the bot`);
  if (p.failed) parts.push(`${num(p.failed)} failed`);
  if (p.skipped) parts.push(`${num(p.skipped)} skipped`);
  return parts.join(" · ");
}

function ProgressBar({ p }: { p: Progress }) {
  const done = p.sent + p.failed + p.blocked + p.skipped;
  const pct = p.total > 0 ? Math.min(100, Math.round((done / p.total) * 100)) : p.status === "done" ? 100 : 0;
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]"
        role="progressbar"
        aria-label="Sending the post"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-[var(--ink-blue-solid)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm tabular-nums text-[var(--text-secondary)]">
        {num(done)} of about {num(p.total)} students · {countsLine(p)}
      </p>
    </div>
  );
}

/** Roughly how Telegram shows the post; the test shows it exactly. */
function PostPreview({ text, photo, button }: { text: string; photo: Photo | null; button: { text: string; url: string } }) {
  const html = postToHtml(text.trim());
  const empty = !html && !photo;
  return (
    <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
      <div className="max-w-[360px] overflow-hidden rounded-2xl rounded-bl-md border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        {photo && <img src={photo.url} alt="" className="block max-h-[320px] w-full object-cover" />}
        {empty ? (
          <p className="px-3.5 py-3 text-sm text-[var(--text-secondary)]">Your post shows here.</p>
        ) : html ? (
          // postToHtml escapes the text and only adds <b> and <i>.
          <p
            className="whitespace-pre-wrap break-words px-3.5 py-3 text-[0.9375rem] leading-relaxed text-[var(--text-primary)]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex max-w-[360px] flex-col gap-1.5">
        {button.text.trim() && (
          <span className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-center text-sm font-medium text-[var(--ink-blue)] shadow-sm">
            {button.text.trim()}
          </span>
        )}
        <span className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-center text-sm font-medium text-[var(--ink-blue)] shadow-sm">
          🔕 Stop announcements
        </span>
      </div>
    </div>
  );
}

/**
 * One of the bot's on/off switches, kept in config/featureFlags like the
 * site's other switches. `invert` is for a field that means "off" when true
 * (botChecksPaused), so an unset field is "on".
 */
function BotSwitch({
  flag,
  invert = false,
  icon: Icon,
  title,
  label,
  describe,
}: {
  flag: "showTelegramBot" | "botChecksPaused";
  invert?: boolean;
  icon: LucideIcon;
  title: string;
  label: string;
  describe: (on: boolean) => ReactNode;
}) {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFeatureFlag(flag, adminDb)
      .then((value) => setOn(invert ? !value : value))
      .catch((e) => {
        console.error(e);
        setError("Could not read this switch. Reload the page to try again.");
      });
  }, [flag, invert]);

  const toggle = async (next: boolean) => {
    setOn(next);
    setError("");
    try {
      await setFeatureFlag(flag, invert ? !next : next, adminDb);
    } catch (e) {
      console.error(e);
      setOn(!next);
      setError("Could not change it. Try again.");
    }
  };

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
            {/* Until the setting is known, say so rather than describe a state that may be wrong. */}
            {error ? (
              <p role="alert" className="mt-0.5 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <p className="mt-0.5 max-w-[70ch] text-sm text-[var(--text-secondary)]">
                {on === null ? "Checking the current setting…" : describe(on)}
              </p>
            )}
          </div>
        </div>
        {/* Locked until the current setting is known, so it is never flipped blind. */}
        <Switch checked={on === true} onChange={toggle} disabled={on === null} label={label} />
      </header>
    </section>
  );
}

/** One student, as api/_lib/studentBot.ts listBotStudents sends it. */
interface BotStudent {
  telegramId: string;
  name: string;
  username: string;
  joinedAt: number;
  lastSeenAt: number | null;
  email: string | null;
  plan: string | null;
  connected: boolean;
  checks: number;
  freeReady: boolean;
  nextFreeAt: number | null;
  freeRule: "two-weeks" | "weekly-site" | "weekly-plan";
  extraChecks: number;
  invitesThisMonth: number;
  invited: boolean;
  wordHour: number | null;
  reminders: boolean;
  announcements: boolean;
  blocked: boolean;
  writing: boolean;
}

type StudentFilter = "all" | "connected" | "not-connected" | "word" | "blocked";

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const FREE_RULE: Record<BotStudent["freeRule"], string> = {
  "two-weeks": "1 every 2 weeks",
  "weekly-site": "1 a week, shared with the site",
  "weekly-plan": "1 a week, on top of the plan",
};

function Muted({ children }: { children: ReactNode }) {
  return <span className="block text-xs text-[var(--text-secondary)]">{children}</span>;
}

/**
 * Everyone who uses the bot, newest first, with their site account, what they
 * did, their free checks and their message settings. Loaded once when the
 * section opens (a read per student), more on request.
 */
function StudentsPanel() {
  const [students, setStudents] = useState<BotStudent[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api({ action: "students", before });
      if (!res.ok) throw new Error(await errorOf(res));
      const data = (await res.json()) as { students: BotStudent[]; more: boolean };
      setStudents((list) => (before === undefined ? data.students : [...list, ...data.students]));
      setMore(data.more);
    } catch (e) {
      console.error(e);
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    all: students.length,
    connected: students.filter((s) => s.connected).length,
    "not-connected": students.filter((s) => !s.connected).length,
    word: students.filter((s) => s.wordHour !== null).length,
    blocked: students.filter((s) => s.blocked).length,
  }), [students]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    return students.filter((s) => {
      if (filter === "connected" && !s.connected) return false;
      if (filter === "not-connected" && s.connected) return false;
      if (filter === "word" && s.wordHour === null) return false;
      if (filter === "blocked" && !s.blocked) return false;
      if (!q) return true;
      return [s.name, s.username, s.email ?? "", s.telegramId].some((v) => v.toLowerCase().includes(q));
    });
  }, [students, search, filter]);

  return (
    <Panel
      title="Students"
      description={loading && !students.length ? "Loading…" : `${num(students.length)}${more ? "+" : ""} students use the bot, newest first.`}
      className="mb-6"
      bodyClassName="px-0 pb-0"
    >
      <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-72">
          <SearchField value={search} onChange={setSearch} placeholder="Name, @username, email or ID" label="Search students" inputRef={searchRef} />
        </div>
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: counts.all },
            { id: "connected", label: "Connected", count: counts.connected },
            { id: "not-connected", label: "Not connected", count: counts["not-connected"] },
            { id: "word", label: "Daily word on", count: counts.word },
            { id: "blocked", label: "Blocked the bot", count: counts.blocked },
          ]}
        />
      </div>

      {failed ? (
        <LoadError what="the students" onRetry={() => load()} className="mx-5 mb-5" />
      ) : loading && !students.length ? (
        <RowSkeletons rows={4} />
      ) : !shown.length ? (
        <EmptyState icon={Users} title={students.length ? "No students match" : "No students yet"}>
          {students.length ? "Try another search or filter." : "Students show here once they start the bot."}
        </EmptyState>
      ) : (
        <div className="max-h-[560px] overflow-y-auto border-t border-[var(--border-color)]">
          <Table className="[&_td]:px-3 [&_td]:py-3 [&_th]:px-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>th]:whitespace-nowrap">
                <TableHead>Student</TableHead>
                <TableHead>Site account</TableHead>
                <TableHead>Essays</TableHead>
                <TableHead>Free check</TableHead>
                <TableHead>Daily word</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s) => (
                <TableRow key={s.telegramId} className="align-top">
                  <TableCell className="min-w-[160px] align-top">
                    <span className="block font-medium text-[var(--text-primary)]">{s.name || "No name"}</span>
                    {s.username && (
                      <a
                        href={`https://t.me/${s.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-[var(--ink-blue)] underline-offset-4 hover:underline"
                      >
                        @{s.username}
                        <span className="sr-only"> (opens in Telegram)</span>
                      </a>
                    )}
                    <Muted>ID {s.telegramId}</Muted>
                    {s.blocked && <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">Blocked the bot</span>}
                    {s.writing && !s.blocked && <Muted>Writing an essay now</Muted>}
                  </TableCell>
                  <TableCell className="min-w-[200px] align-top">
                    {s.connected ? (
                      <>
                        <span className="block text-[var(--text-primary)] [overflow-wrap:anywhere]">{s.email ?? "Account not set up yet"}</span>
                        <Muted>{s.plan ? `${s.plan} plan` : "Free plan"}</Muted>
                      </>
                    ) : (
                      <span className="text-[var(--text-secondary)]">Not connected</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[120px] align-top tabular-nums">
                    <span className="block whitespace-nowrap text-[var(--text-primary)]">{num(s.checks)} checked</span>
                    {s.invitesThisMonth > 0 && <Muted>Invited {s.invitesThisMonth} this month</Muted>}
                    {s.invited && <Muted>Came by invite</Muted>}
                  </TableCell>
                  <TableCell className="min-w-[150px] align-top">
                    {s.freeReady ? (
                      <span className="block font-medium text-emerald-700 dark:text-emerald-400">Ready</span>
                    ) : (
                      <span className="block text-[var(--text-primary)]">Next {s.nextFreeAt ? shortDate(s.nextFreeAt) : "—"}</span>
                    )}
                    <Muted>{FREE_RULE[s.freeRule]}</Muted>
                    {s.extraChecks > 0 && <Muted>+{s.extraChecks} extra from invites</Muted>}
                  </TableCell>
                  <TableCell className="align-top tabular-nums">
                    {s.wordHour === null ? (
                      <span className="text-[var(--text-secondary)]">Off</span>
                    ) : (
                      <span className="text-[var(--text-primary)]">{String(s.wordHour).padStart(2, "0")}:00</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[140px] align-top">
                    <Muted>Free check back: {s.reminders ? "on" : "off"}</Muted>
                    <Muted>Your posts: {s.announcements ? "on" : "off"}</Muted>
                  </TableCell>
                  <TableCell className="min-w-[120px] align-top">
                    <span className="block whitespace-nowrap text-[var(--text-primary)]">{s.lastSeenAt ? timeAgo(new Date(s.lastSeenAt)) : "—"}</span>
                    <Muted>Joined {s.joinedAt ? timeAgo(new Date(s.joinedAt)) : "—"}</Muted>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {more && !failed && (
        <div className="border-t border-[var(--border-color)] px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            loading={loading}
            onClick={() => load(students.length ? students[students.length - 1].joinedAt : undefined)}
          >
            Show more students
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function TelegramBotSection() {
  const { confirm, dialog } = useConfirm();
  const [audience, setAudience] = useState<Audience | null>(null);
  const [recent, setRecent] = useState<Sent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [button, setButton] = useState({ text: "", url: "" });
  const [testing, setTesting] = useState(false);
  /** What the last good test sent, and the picture's id on Telegram from it. */
  const [tested, setTested] = useState<{ sig: string; photoFileId: string | null } | null>(null);
  const [running, setRunning] = useState<{ id: string; progress: Progress } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info" | "warning"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api({ action: "overview" });
      if (!res.ok) throw new Error(await errorOf(res));
      const data = (await res.json()) as { audience: Audience; recent: Sent[] };
      setAudience(data.audience);
      setRecent(data.recent);
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const hasButton = Boolean(button.text.trim() || button.url.trim());
  const problem = postProblem({ text, button: hasButton ? button : null, hasPhoto: photo !== null });
  const limit = photo ? CAPTION_LIMIT : TEXT_LIMIT;
  const length = postLength(text.trim());
  const sig = useMemo(
    () => JSON.stringify({
      text: text.trim(),
      button: hasButton ? { text: button.text.trim(), url: button.url.trim() } : null,
      photo: photo ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}` : null,
    }),
    [text, button, hasButton, photo],
  );
  const testedThis = tested?.sig === sig;
  const busy = testing || running !== null;
  const otherSending = recent.some((r) => r.status === "sending");

  const choosePhoto = (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) return setNotice({ tone: "error", text: "Choose a JPG, PNG or WebP picture." });
    if (file.size > MAX_PHOTO_BYTES) return setNotice({ tone: "error", text: "The picture is over 5 MB. Choose a smaller one." });
    setNotice(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const postBody = (photoFileId: string | null) => ({
    text: text.trim(),
    button: hasButton ? { text: button.text.trim(), url: button.url.trim() } : null,
    photoFileId,
  });

  const sendTest = async () => {
    if (problem) return setNotice({ tone: "error", text: problem });
    setTesting(true);
    setNotice(null);
    try {
      // The picture goes up with the test; everyone else gets it by the id Telegram gives back.
      const upload = photo ? { name: photo.file.name, type: photo.file.type, base64: await toBase64(photo.file) } : null;
      const res = await api({ action: "test", ...postBody(null), photo: upload });
      if (!res.ok) throw new Error(await errorOf(res));
      const data = (await res.json()) as { photoFileId: string | null; sentTo: number };
      setTested({ sig, photoFileId: data.photoFileId });
      setNotice({ tone: "success", text: "Sent to your Telegram. Check how it looks, then send it to everyone." });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    }
    setTesting(false);
  };

  const run = async (id: string, body: Record<string, unknown>, start: Progress) => {
    setRunning({ id, progress: start });
    setNotice(null);
    let last: RunLine = {};
    try {
      const res = await api(body);
      if (!res.ok) throw new Error(await errorOf(res));
      await readLines(res, (line) => {
        last = line;
        if (line.status) setRunning({ id, progress: { ...start, ...line } as Progress });
      });
      if (last.error) {
        setNotice({ tone: "error", text: last.error });
      } else if (last.busy) {
        setNotice({ tone: "info", text: "This post is already being sent. Its progress is below." });
      } else if (last.status === "done") {
        setNotice({ tone: "success", text: `Done. ${countsLine(last as Progress)}.` });
        return true;
      } else if (last.paused) {
        setNotice({ tone: "info", text: "Paused to stay within the server's time limit. The rest goes out by itself within the hour, or press Continue below." });
      }
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      setRunning(null);
      load();
    }
    return false;
  };

  const sendAll = async () => {
    if (!testedThis || !audience) return;
    const reach = audience.reach;
    const ok = await confirm(
      `This sends the post to about ${num(reach)} students on Telegram. A sent post can't be taken back.`,
      { title: "Send to all students?", confirmLabel: `Send to ${num(reach)} students` },
    );
    if (!ok) return;
    const id = crypto.randomUUID().replace(/-/g, "");
    const finished = await run(
      id,
      { action: "send", id, ...postBody(tested?.photoFileId ?? null) },
      { status: "sending", total: reach, sent: 0, failed: 0, blocked: 0, skipped: 0 },
    );
    if (finished) {
      setText("");
      setPhoto(null);
      setButton({ text: "", url: "" });
      setTested(null);
    }
  };

  const carryOn = (s: Sent) => run(s.id, { action: "continue", id: s.id }, s);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-10">
      {dialog}
      <PageHeading
        title="Telegram bot"
        description={
          <>
            Send a post to every student who uses{" "}
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--ink-blue)] underline-offset-4 hover:underline">
              @writeready_student_bot
            </a>
            .
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Whether the site shows the bot (useShowTelegramBot); visitors get it
            with the maintenance status (api/maintenance.ts), no extra read. */}
        <BotSwitch
          flag="showTelegramBot"
          icon={Eye}
          title="Show the bot on the site"
          label="Show the Telegram bot on the site"
          describe={(on) => (
            <>
              {on
                ? "On: the home page, the footer, the sidebar and the dashboard link to the bot."
                : "Off: the site does not mention the bot anywhere."}{" "}
              The bot works either way for anyone who already has it. Visitors see the change the next time they open the site.
              To look first, add <code className="font-mono text-xs">?preview=telegramBot</code> to the site's address.
            </>
          )}
        />
        {/* Whether students can check essays in the bot (checksOpen in api/_lib/studentBot.ts). */}
        <BotSwitch
          flag="botChecksPaused"
          invert
          icon={PenLine}
          title="Essay checks in the bot"
          label="Let students check essays in the bot"
          describe={(on) => (
            <>
              {on
                ? "On: students can check essays in the bot."
                : "Off: a student who tries is told checks are paused for now. Nothing is taken from their free checks, and the \"your free check is back\" messages wait until checks are on again."}{" "}
              The daily word, /account, invites and posts keep working. Takes effect within a minute.
            </>
          )}
        />
      </div>

      {loadFailed ? (
        <LoadError what="the bot's numbers" onRetry={load} className="mb-6" />
      ) : (
        <StatStrip
          className="mb-6"
          items={[
            { label: "Students on the bot", value: audience ? num(audience.students) : "…" },
            { label: "A post reaches", value: audience ? num(audience.reach) : "…" },
            { label: "Turned announcements off", value: audience ? num(audience.off) : "…" },
            { label: "Blocked the bot", value: audience ? num(audience.blocked) : "…" },
          ]}
        />
      )}

      <StudentsPanel />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="New post" description="Write it, send a test to yourself, then send it to everyone.">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              sendTest();
            }}
          >
            <Field
              label="Text"
              htmlFor="tg-post-text"
              hint={
                <span className="flex flex-wrap justify-between gap-2">
                  <span>Use **bold** and _italic_. Links work as they are.</span>
                  <span className={length > limit ? "font-medium text-red-600 dark:text-red-400" : "tabular-nums"}>
                    {num(length)} / {num(limit)}
                  </span>
                </span>
              }
            >
              <Textarea
                id="tg-post-text"
                name="tg-post-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                placeholder="🎉 New on WriteReady: …"
              />
            </Field>

            <Field label="Picture" optional hint="JPG, PNG or WebP, up to 5 MB. With a picture, the text can be up to 1,024 characters.">
              <div className="flex flex-wrap items-center gap-2">
                <FileButton accept={PHOTO_TYPES.join(",")} onFile={choosePhoto} disabled={busy}>
                  <ImagePlus size={16} aria-hidden="true" />
                  {photo ? "Change picture" : "Add picture"}
                </FileButton>
                {photo && (
                  <>
                    <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{photo.file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)} disabled={busy}>
                      <X aria-hidden="true" />
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Button text" htmlFor="tg-post-button" optional>
                <Input
                  id="tg-post-button"
                  name="tg-post-button"
                  autoComplete="off"
                  value={button.text}
                  onChange={(e) => setButton((b) => ({ ...b, text: e.target.value }))}
                  disabled={busy}
                  placeholder="Open WriteReady"
                />
              </Field>
              <Field label="Button link" htmlFor="tg-post-link" optional>
                <Input
                  id="tg-post-link"
                  name="tg-post-link"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={button.url}
                  onChange={(e) => setButton((b) => ({ ...b, url: e.target.value }))}
                  disabled={busy}
                  placeholder="https://www.writeready.uz"
                />
              </Field>
            </div>

            {(text.trim() || photo || hasButton) && problem && <Notice tone="warning">{problem}</Notice>}

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-color)] pt-5">
              <Button type="submit" variant="outline" loading={testing} disabled={busy || problem !== null}>
                <Send aria-hidden="true" />
                {testedThis ? "Send the test again" : "Send a test to me"}
              </Button>
              <Button type="button" onClick={sendAll} disabled={busy || !testedThis || !audience || otherSending}>
                <Megaphone aria-hidden="true" />
                {audience ? `Send to ${num(audience.reach)} students` : "Send to all students"}
              </Button>
            </div>
            <p className="-mt-2 text-xs text-[var(--text-secondary)]">
              {otherSending
                ? "Another post is still being sent. Wait for it to finish, or continue it below."
                : testedThis
                  ? "The test matches this post. A sent post can't be taken back."
                  : "Send a test first. Sending to everyone opens once the test matches the post, because a sent post can't be taken back."}
            </p>

            {running && (
              <div role="status" aria-live="polite" className="flex flex-col gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">Sending… Keep this page open to watch. If you close it, the rest goes out within the hour.</p>
                <ProgressBar p={running.progress} />
              </div>
            )}
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          </form>
        </Panel>

        <Panel title="Preview" description="Roughly how it looks in Telegram. The test shows it exactly.">
          <PostPreview text={text} photo={photo} button={button} />
          <p className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <BellOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Every post has a Stop announcements button. Students who press it, or who blocked the bot, are skipped.
          </p>
        </Panel>
      </div>

      <Panel title="Sent posts" className="mt-6" bodyClassName="px-0 pb-0">
        {loading && !recent.length ? (
          <p className="px-5 pb-5 text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : !recent.length ? (
          <EmptyState icon={Megaphone} title="No posts yet">
            Posts you send to the bot's students show here, with how many got each one.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--border-color)] border-t border-[var(--border-color)]">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1 basis-[280px]">
                  <p className="line-clamp-2 break-words text-sm text-[var(--text-primary)]">
                    {s.hasPhoto && <span aria-label="With a picture">🖼️ </span>}
                    {s.text || <span className="text-[var(--text-secondary)]">(picture only)</span>}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-[var(--text-secondary)]">
                    {timeAgo(new Date(s.createdAt))} · {countsLine(s)}
                    {s.status === "sending" && ` · ${s.active ? "sending now" : "paused"}`}
                  </p>
                </div>
                {s.status === "sending" && !s.active && (
                  <Button variant="outline" size="sm" onClick={() => carryOn(s)} disabled={busy}>
                    Continue
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
