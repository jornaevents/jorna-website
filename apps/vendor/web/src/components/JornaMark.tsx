// The app icon's mark — the diya over joined hands — without its wordmark,
// for beside the "Jorna" text in the landing and entry headers. Cropped from
// the app icon with its white background made transparent (public/img/
// jorna-mark-*.png). Decorative: the "Jorna" text next to it is the name.

export function JornaMark({ className = "h-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export; see home/page.tsx on plain <img> + /app prefix
    <img
      src="/app/img/jorna-mark-96.png"
      srcSet="/app/img/jorna-mark-192.png 2x"
      alt=""
      width={116}
      height={96}
      className={`w-auto shrink-0 ${className}`}
    />
  );
}
