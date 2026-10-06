import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type SetStateAction,
} from 'react';
import { ImageUp, ZoomIn, ZoomOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { Button } from '../ui/Button';
import { ProfileAvatar } from './parts';
import {
  MAX_ZOOM,
  PHOTO_TYPES,
  centredFraming,
  clampFraming,
  exportPhoto,
  framingStyle,
  imagePixelsPer,
  loadPhoto,
  photoFileProblem,
  removeProfilePhoto,
  saveProfilePhoto,
  type Framing,
} from '../../lib/profilePhoto';

// The photo row at the top of My Account's Profile card. At rest it shows the
// photo with Upload / Change and Remove. Choosing a file opens the framing
// step in place: the student drags the photo inside a square shaped like
// their avatar, zooms, sees it at the sizes the site uses, and saves. The
// dashboard's camera button lands here (#photo).

export const PHOTO_UPLOAD_ID = 'photo-upload';

/** The whole image, placed so `framing` fills a `size`-pixel square. */
function Framed({ img, framing, size, className }: { img: HTMLImageElement; framing: Framing; size: number; className: string }) {
  const s = framingStyle(framing, img.naturalWidth, img.naturalHeight, size);
  return (
    <div aria-hidden="true" className={`relative shrink-0 overflow-hidden bg-[var(--bg-subtle)] ${className}`} style={{ width: size, height: size }}>
      <img
        src={img.src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{ width: s.width, height: s.height, left: s.left, top: s.top }}
      />
    </div>
  );
}

function Framer({ img, framing, setFraming }: { img: HTMLImageElement; framing: Framing; setFraming: Dispatch<SetStateAction<Framing>> }) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const stageRef = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [stage, setStage] = useState(240);
  const [dragging, setDragging] = useState(false);

  // The stage shrinks on a narrow phone; drags are measured against its real size.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage(el.getBoundingClientRect().width || 240);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const moveBy = (dx: number, dy: number) =>
    setFraming((f) => {
      const per = imagePixelsPer(f, w, h, stage);
      return clampFraming({ ...f, cx: f.cx - dx * per, cy: f.cy - dy * per }, w, h);
    });
  const zoomTo = (zoom: number) => setFraming((f) => clampFraming({ ...f, zoom }, w, h));

  // A wheel or trackpad pinch zooms. Not a React handler: those are passive,
  // and the page would scroll at the same time.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFraming((f) => clampFraming({ ...f, zoom: f.zoom * Math.exp(-e.deltaY / 400) }, w, h));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [w, h, setFraming]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!last.current) return;
    moveBy(e.clientX - last.current.x, e.clientY - last.current.y);
    last.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    last.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    if (moves[e.key]) moveBy(...moves[e.key]);
    else if (e.key === '+' || e.key === '=') zoomTo(framing.zoom * 1.1);
    else if (e.key === '-' || e.key === '_') zoomTo(framing.zoom / 1.1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={stageRef}
      role="group"
      tabIndex={0}
      aria-label="Photo position. Drag the photo, or use the arrow keys to move it and plus or minus to zoom."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={`relative aspect-square w-full max-w-60 touch-none select-none overflow-hidden rounded-[18px] bg-[var(--bg-subtle)] outline-none ring-1 ring-[var(--border-color)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <Framed img={img} framing={framing} size={stage} className="rounded-[18px]" />
      {/* Thirds, to line a face up by, only while the photo is moving. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none ${dragging ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute inset-y-0 left-1/3 w-px bg-white/60 mix-blend-difference" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-white/60 mix-blend-difference" />
        <div className="absolute inset-x-0 top-1/3 h-px bg-white/60 mix-blend-difference" />
        <div className="absolute inset-x-0 top-2/3 h-px bg-white/60 mix-blend-difference" />
      </div>
    </div>
  );
}

export function PhotoSection({ name }: { name: string }) {
  const { user, profile, avatarUrl, photoChanged } = useAuth();
  const { confirm, dialog } = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [framing, setFraming] = useState<Framing>({ cx: 0, cy: 0, zoom: 1 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'open' | 'save' | 'remove' | null>(null);
  const [dropping, setDropping] = useState(false);

  const hasOwn = !!profile?.photoVersion;
  const showsGooglePhoto = !hasOwn && !!user?.photoURL;

  // The chosen file's object URL lives only while it is being framed.
  const urlRef = useRef<string | null>(null);
  const holdUrl = (url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
  };
  useEffect(() => () => holdUrl(null), []);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    const problem = photoFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy('open');
    try {
      const image = await loadPhoto(file);
      holdUrl(image.src);
      setFraming(centredFraming(image.naturalWidth, image.naturalHeight));
      setImg(image);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This image could not be opened.');
    } finally {
      setBusy(null);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still fires
    void open(file);
  };

  const close = () => {
    setImg(null);
    holdUrl(null);
    setTimeout(() => uploadRef.current?.focus(), 0);
  };

  const save = async () => {
    if (!user || !img) return;
    setBusy('save');
    setError(null);
    try {
      const photo = exportPhoto(img, framing);
      const version = await saveProfilePhoto(user, photo);
      photoChanged(version, photo);
      setNotice('Photo saved.');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your photo could not be saved. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!user) return;
    setError(null);
    setNotice(null);
    const ok = await confirm(
      user.photoURL ? 'Your Google photo will show again instead.' : 'Your initials will show instead.',
      { title: 'Remove your photo?', confirmLabel: 'Remove photo', destructive: true },
    );
    if (!ok) return;
    setBusy('remove');
    try {
      await removeProfilePhoto(user);
      photoChanged(null, null);
      setNotice('Photo removed.');
      setTimeout(() => uploadRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your photo could not be removed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropping(false);
    if (!img) void open(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      id="photo"
      className={`scroll-mt-6 rounded-[14px] transition-shadow duration-150 motion-reduce:transition-none ${dropping ? 'ring-2 ring-[var(--ring)] ring-offset-4 ring-offset-[var(--bg-card)]' : ''}`}
      onDragOver={(e) => {
        if (img || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        onChange={onFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {img ? (
        <div className="staff-detail-in grid items-start gap-5 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6">
          <Framer img={img} framing={framing} setFraming={setFraming} />

          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Position your photo</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Drag it inside the square, and zoom in to fill it.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFraming((f) => clampFraming({ ...f, zoom: f.zoom / 1.25 }, img.naturalWidth, img.naturalHeight))}
                disabled={framing.zoom <= 1}
                aria-label="Zoom out"
                className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
              >
                <ZoomOut className="size-4" aria-hidden="true" />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={framing.zoom}
                onChange={(e) => setFraming((f) => clampFraming({ ...f, zoom: Number(e.target.value) }, img.naturalWidth, img.naturalHeight))}
                aria-label="Zoom"
                aria-valuetext={`${Math.round(framing.zoom * 100)}%`}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--ink-blue)]"
              />
              <button
                type="button"
                onClick={() => setFraming((f) => clampFraming({ ...f, zoom: f.zoom * 1.25 }, img.naturalWidth, img.naturalHeight))}
                disabled={framing.zoom >= MAX_ZOOM}
                aria-label="Zoom in"
                className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
              >
                <ZoomIn className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">How it will look</p>
              <div className="flex items-end gap-5">
                <div className="flex flex-col items-center gap-1.5">
                  <Framed img={img} framing={framing} size={72} className="rounded-[18px] ring-4 ring-[var(--bg-card)] shadow-[var(--shadow-md)]" />
                  <span className="text-xs text-[var(--text-secondary)]">Profile</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Framed img={img} framing={framing} size={32} className="rounded-full" />
                  <span className="text-xs text-[var(--text-secondary)]">Menu</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy === 'save'}>
                {busy === 'save' ? 'Saving…' : 'Save photo'}
              </Button>
              <Button variant="outline" onClick={close} disabled={busy === 'save'}>
                Cancel
              </Button>
              <Button variant="link" className="px-2" onClick={() => inputRef.current?.click()} disabled={busy === 'save'}>
                Choose another
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <ProfileAvatar src={avatarUrl} name={name} size="md" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Profile photo</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {showsGooglePhoto ? 'Showing your Google photo. ' : ''}JPG, PNG or WebP, up to 2 MB.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                ref={uploadRef}
                id={PHOTO_UPLOAD_ID}
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={busy !== null}
              >
                <ImageUp aria-hidden="true" />
                {busy === 'open' ? 'Opening…' : hasOwn ? 'Change photo' : 'Upload photo'}
              </Button>
              {hasOwn && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={remove}
                  disabled={busy !== null}
                  className="text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  {busy === 'remove' ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {notice && !error && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      </div>
      {dialog}
    </div>
  );
}
