"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@jorna/shared/components/ui";
import { clientAppUrl } from "@/lib/clientApp";
import { Drawer } from "@/components/vendor/ui";

/** The vendor's public inquiry form, as a link and a QR code to put in an
 *  Instagram bio, on a website or on a printed card. Whatever's sent there
 *  lands here in Leads (backend DECISIONS #32). */
export function inquiryFormUrl(vendorId: string): string {
  return clientAppUrl(`/inquire/?vendor=${encodeURIComponent(vendorId)}`);
}

export function InquiryShareButton({ vendorId }: { vendorId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Share your inquiry form
      </Button>
      <InquiryShareDrawer open={open} vendorId={vendorId} onClose={() => setOpen(false)} />
    </>
  );
}

function InquiryShareDrawer({ open, vendorId, onClose }: { open: boolean; vendorId: string; onClose: () => void }) {
  const url = inquiryFormUrl(vendorId);
  // Kept with the link it was drawn for, so nothing is reset by hand.
  const [qr, setQr] = useState<{ url: string; png: string } | null>(null);
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" })
      .then((png) => !cancelled && setQr({ url, png }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const png = qr?.url === url ? qr.png : null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your inquiry form"
      subtitle="Anyone with this link can ask you about their event, no account needed. What they send shows up here as a new lead, and we email it to you."
    >
      <div className="grid gap-6">
        <div>
          <label htmlFor="inquiry-link" className="mb-1.5 block text-sm font-medium text-ink-soft">
            Link
          </label>
          <div className="flex gap-2">
            <input
              id="inquiry-link"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold"
            />
            <Button type="button" onClick={copy}>
              {copied === "done" ? "Copied" : "Copy"}
            </Button>
          </div>
          {copied === "failed" ? (
            <p role="alert" className="mt-1.5 text-xs text-ink-faint">
              Couldn&apos;t copy it here. Select the link and copy it yourself.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-faint">
            Put it in your Instagram bio, or link to it from your website.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold hover:underline">
              See what clients see
            </a>
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-soft">QR code</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid size-40 place-items-center rounded-xl border border-card-edge bg-white p-2">
              {png ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL; next/image can't help
                <img src={png} alt="QR code for your inquiry form" className="size-full" />
              ) : (
                <span className="text-xs text-ink-faint">Drawing…</span>
              )}
            </div>
            {png ? (
              <a
                href={png}
                download="jorna-inquiry-form-qr.png"
                className="inline-flex items-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
              >
                Download QR code
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-faint">For business cards, flyers and your table at a wedding expo.</p>
        </div>
      </div>
    </Drawer>
  );
}
