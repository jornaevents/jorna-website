// The app icon's mark — the diya over joined hands — without its wordmark,
// beside the "Jorna" text in the top bar. The vendor app has its own copy
// (apps/vendor) because each app serves the image under its own basePath.
// Decorative: the "Jorna" text next to it is the name.

export function JornaMark({ className = "h-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export under basePath /client; next/image would need a loader
    <img
      src="/client/img/jorna-mark-96.png"
      srcSet="/client/img/jorna-mark-192.png 2x"
      alt=""
      width={116}
      height={96}
      className={`w-auto shrink-0 ${className}`}
    />
  );
}
