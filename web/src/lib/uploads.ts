// Client-side pre-checks for vendor media uploads.
//
// The backend is the authority — uploadServiceVideos' own comment in jorna.ts
// says it caps videos at 50MB/30s server-side "rather than trusting a
// client-side check" — so nothing here replaces that. This exists only to
// fail fast with a specific reason instead of a slow mobile upload that gets
// rejected anyway, or a wrong-format file the picker's `accept` hint didn't
// actually stop (that attribute is advisory; a renamed file or a script can
// still hand a File object of any type to the input).

export interface UploadRejection {
  file: File;
  reason: string;
}

export interface FileCheck {
  ok: File[];
  rejected: UploadRejection[];
}

// Mirrors uploadServiceVideos' documented server-side cap (jorna.ts) and the
// "Up to 50MB and 30 seconds each" copy already shown next to the picker.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** A blank `file.type` means the browser couldn't sniff it (happens for some
 *  formats on some mobile browsers) — treated as "unknown," not "wrong," so
 *  a legitimate file isn't rejected client-side over a browser quirk. Only a
 *  type the browser actually reported and got wrong is rejected here. */
function typeMismatch(file: File, matches: (type: string) => boolean): boolean {
  return file.type !== "" && !matches(file.type);
}

export function checkImageFiles(files: File[]): FileCheck {
  const ok: File[] = [];
  const rejected: UploadRejection[] = [];
  for (const file of files) {
    if (typeMismatch(file, (t) => t.startsWith("image/"))) {
      rejected.push({ file, reason: "not a photo" });
    } else {
      ok.push(file);
    }
  }
  return { ok, rejected };
}

/** Reads a video's real duration from the file itself. Resolves null (never
 *  rejects on this basis) if the browser can't decode it — that file is left
 *  for the backend to judge rather than blocked on a check that didn't work. */
function videoDurationSeconds(file: File): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const finish = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
}

export async function checkVideoFiles(files: File[]): Promise<FileCheck> {
  const ok: File[] = [];
  const rejected: UploadRejection[] = [];
  for (const file of files) {
    if (typeMismatch(file, (t) => VIDEO_TYPES.has(t))) {
      rejected.push({ file, reason: "not an mp4, mov, or webm video" });
      continue;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      rejected.push({ file, reason: "over 50MB" });
      continue;
    }
    const duration = await videoDurationSeconds(file);
    if (duration != null && duration > MAX_VIDEO_SECONDS) {
      rejected.push({ file, reason: "longer than 30 seconds" });
      continue;
    }
    ok.push(file);
  }
  return { ok, rejected };
}

/** "photo1.png (not a photo), clip.mov (over 50MB)" — one line naming every
 *  rejected file and why, so the reason isn't buried behind a generic error. */
export function describeRejections(rejected: UploadRejection[]): string {
  return rejected.map((r) => `${r.file.name} (${r.reason})`).join(", ");
}
