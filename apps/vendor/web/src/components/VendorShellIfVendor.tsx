"use client";

// The sidebar for a shared page (Messages), shown only when a vendor is the
// one looking — see useVendorShell in ChromeGate for why these routes can't
// just join the (vendor) route group.
//
// While the role is still unknown this renders placeholders rather than the
// page itself: drawing the page bare and then wrapping it in the sidebar once
// the answer arrives would remount it, throwing away whatever it had loaded.

import { usePathname } from "next/navigation";
import { VendorSidebar } from "@/components/VendorSidebar";
import { useVendorShell } from "@/components/ChromeGate";
import { MessagesHubSkeleton } from "@/components/vendor/MessagesHub";
import { SkeletonBody, SkeletonCard } from "@/components/vendor/PageSkeleton";

export function VendorShellIfVendor({ children }: { children: React.ReactNode }) {
  const shell = useVendorShell();
  const pathname = usePathname();
  if (shell === null) {
    return (
      <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10">
        {pathname.startsWith("/messages") ? (
          <MessagesHubSkeleton />
        ) : (
          <SkeletonBody label="Loading the conversation…">
            <SkeletonCard lines={5} />
          </SkeletonBody>
        )}
      </div>
    );
  }
  return shell ? <VendorSidebar>{children}</VendorSidebar> : <>{children}</>;
}
