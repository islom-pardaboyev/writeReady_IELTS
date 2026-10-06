import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

// A student's own profile photo. The browser checks the file, lets the student
// frame it (src/components/profile/PhotoEditor.tsx), and sends a small square
// copy to api/_lib/routes/profilePhoto.ts, which keeps it in
// profile_photos/{uid}.

/** The most a chosen file may weigh. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The saved square, in pixels: sharp at the largest size the site shows (112px) on a 3x screen. */
const OUTPUT = 400;
export const MAX_ZOOM = 4;

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/** Why a file cannot be used, or null when it can. */
export function photoFileProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > MAX_PHOTO_BYTES) return `This photo is ${mb(file.size)} MB. Choose one up to 2 MB.`;
  return null;
}

/**
 * Opens the chosen file. Its object URL stays alive while the student frames
 * the photo; call URL.revokeObjectURL(img.src) when done with it.
 */
export function loadPhoto(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) return resolve(img);
      URL.revokeObjectURL(url);
      reject(new Error("This image is empty. Try another one."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened. Try another one."));
    };
    img.src = url;
  });
}

/**
 * How the photo sits in the square, in the image's own pixels, so it holds
 * at any frame size: the point at the centre of the square, and the zoom
 * (1 = the short side just fills it).
 */
export interface Framing {
  cx: number;
  cy: number;
  zoom: number;
}

/** The side of the square, in image pixels. */
const side = (w: number, h: number, zoom: number) => Math.min(w, h) / zoom;

/** Keeps the square inside the image, so no empty edge ever shows. */
export function clampFraming(f: Framing, w: number, h: number): Framing {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, f.zoom));
  const half = side(w, h, zoom) / 2;
  return {
    zoom,
    cx: Math.min(w - half, Math.max(half, f.cx)),
    cy: Math.min(h - half, Math.max(half, f.cy)),
  };
}

export const centredFraming = (w: number, h: number): Framing => ({ cx: w / 2, cy: h / 2, zoom: 1 });

/** Where to draw the whole image so `f` fills a `frame`-pixel square. */
export function framingStyle(f: Framing, w: number, h: number, frame: number) {
  const k = frame / side(w, h, f.zoom);
  return { width: w * k, height: h * k, left: frame / 2 - f.cx * k, top: frame / 2 - f.cy * k };
}

/** Image pixels per frame pixel, to turn a drag on screen into a move of the photo. */
export const imagePixelsPer = (f: Framing, w: number, h: number, frame: number) => side(w, h, f.zoom) / frame;

/** The framed square as the data URL the server keeps: WebP, or JPEG where WebP cannot be made. */
export function exportPhoto(img: HTMLImageElement, f: Framing): string {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo.");
  // A transparent PNG would come out black as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT, OUTPUT);
  ctx.imageSmoothingQuality = "high";
  const s = side(img.naturalWidth, img.naturalHeight, f.zoom);
  ctx.drawImage(img, f.cx - s / 2, f.cy - s / 2, s, s, 0, 0, OUTPUT, OUTPUT);
  const webp = canvas.toDataURL("image/webp", 0.86);
  // Safari before 17 hands back a PNG when asked for WebP.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.88);
}

async function send(user: User, body: object): Promise<number | null> {
  const res = await fetch("/api/profile-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { photoVersion?: number | null; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Your photo could not be saved. Please try again.");
  return typeof data.photoVersion === "number" ? data.photoVersion : null;
}

export const saveProfilePhoto = (user: User, photo: string) => send(user, { photo });
export const removeProfilePhoto = (user: User) => send(user, { remove: true });

// One read per photo per visit, however many places show it.
const cache = new Map<string, Promise<string | null>>();

export function fetchProfilePhoto(uid: string, version: number): Promise<string | null> {
  const key = `${uid}:${version}`;
  let p = cache.get(key);
  if (!p) {
    p = getDoc(doc(db, "profile_photos", uid)).then(
      (snap) => {
        const photo = snap.exists() ? snap.data().photo : null;
        return typeof photo === "string" && photo.startsWith("data:image/") ? photo : null;
      },
      (err) => {
        cache.delete(key);
        console.error("Could not load the profile photo", err);
        return null;
      },
    );
    cache.set(key, p);
  }
  return p;
}

/** Puts a photo just saved straight into the cache, so it shows without a read. */
export function rememberProfilePhoto(uid: string, version: number, photo: string): void {
  cache.set(`${uid}:${version}`, Promise.resolve(photo));
}
