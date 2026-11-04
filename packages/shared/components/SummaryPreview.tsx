// The AI line an inbox row shows in place of its last message (backend
// summary_service, DECISIONS #42). The server decides when a row gets one —
// several unread, the line still current, nobody in it blocked, the reader
// hasn't turned them off — so this only draws it.
//
// Two lines at most rather than the one-line `truncate` of an ordinary
// preview: the line is written to fit 80 characters, which is about two lines
// of text-sm on a phone, and cutting it mid-sentence would hide the part that
// says who the thread is waiting on.
//
// Callers show it only while the row still has unread: a list that zeroes a
// thread's count when it's opened (without refetching) must drop the line
// then too, as the server would on its next answer.

export function SummaryPreview({
  text,
  size = "sm",
  className = "",
}: {
  text: string;
  /** "xs" for the vendor hub's compact rows. */
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    // A span, not a p: the vendor hub's rows are buttons, which can't hold a p.
    <span
      className={`flex items-start gap-1.5 ${size === "xs" ? "text-xs" : "text-sm"} ${className}`}
      title="AI summary · may miss details"
    >
      <SparkleIcon />
      <span className="sr-only">AI summary, may miss details: </span>
      <span className="line-clamp-2 min-w-0 break-words">{text}</span>
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-[0.2rem] size-3.5 shrink-0 text-gold"
      fill="currentColor"
    >
      <path d="M8 0.5l1.6 4.4 4.4 1.6-4.4 1.6L8 12.5 6.4 8.1 2 6.5l4.4-1.6z" />
      <path d="M13 10.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
