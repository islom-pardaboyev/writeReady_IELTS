import { useCallback, useEffect, useMemo, useState } from "react";
import { BellOff, Eye, ImagePlus, Megaphone, Send, X } from "lucide-react";
import { adminAuth, adminDb } from "@/firebase/adminConfig";
import { getFeatureFlag, setFeatureFlag } from "@/hooks/useFeatureFlag";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, FileButton, LoadError, Notice, PageHeading, Panel, StatStrip, Switch } from "@/components/staff/parts";
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
 * Whether the site shows the bot: the home page and footer links, the sidebar
 * link and the dashboard card (useShowTelegramBot). Off until the admin is
 * ready to announce it. Visitors get it with the maintenance status
 * (api/maintenance.ts), so it costs them no extra read.
 */
function ShowOnSite() {
  const [shown, setShown] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFeatureFlag("showTelegramBot", adminDb)
      .then(setShown)
      .catch((e) => {
        console.error(e);
        setError("Could not read this switch. Reload the page to try again.");
      });
  }, []);

  const toggle = async (next: boolean) => {
    setShown(next);
    setError("");
    try {
      await setFeatureFlag("showTelegramBot", next, adminDb);
    } catch (e) {
      console.error(e);
      setShown(!next);
      setError("Could not change it. Try again.");
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            <Eye size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Show the bot on the site</h2>
            <p className="mt-0.5 max-w-[70ch] text-sm text-[var(--text-secondary)]">
              {shown
                ? "On: the home page, the footer, the sidebar and the dashboard link to the bot."
                : "Off: the site does not mention the bot anywhere."}{" "}
              The bot works either way for anyone who already has it. Visitors see the change the next time they open the site.
              To look before turning it on, add <code className="font-mono text-xs">?preview=telegramBot</code> to the site's address.
            </p>
            {error && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>
        <Switch checked={shown === true} onChange={toggle} disabled={shown === null} label="Show the Telegram bot on the site" />
      </header>
    </section>
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

      <ShowOnSite />

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
