"use client";

// The client's saved vendors (backend 0088), for Explore's hearts and the
// Compare table. Saved on the account, so the shortlist follows them across
// devices. A heart flips at once and is put back if the save fails.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listSavedVendors, saveVendor, unsaveVendor, type SavedVendor } from "@/lib/jorna";

export function useSavedVendors(): {
  /** Null while loading; empty for a signed-out visitor. */
  saved: SavedVendor[] | null;
  /** False for a signed-out visitor, who gets no hearts. */
  canSave: boolean;
  isSaved: (vendorId: string) => boolean;
  toggle: (vendorId: string) => void;
} {
  const { user } = useAuth();
  // Kept with the user it was loaded for, so one account never sees another's.
  const [state, setState] = useState<{ userId: string; items: SavedVendor[] } | null>(null);
  const userId = user?.user_id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listSavedVendors()
      .then((r) => !cancelled && setState({ userId, items: r.items }))
      .catch(() => !cancelled && setState({ userId, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const items = userId && state?.userId === userId ? state.items : null;

  const toggle = useCallback(
    (vendorId: string) => {
      if (!userId) return;
      const list = items ?? [];
      const on = list.some((v) => v.vendor_id === vendorId);
      setState({
        userId,
        items: on
          ? list.filter((v) => v.vendor_id !== vendorId)
          : [{ vendor_id: vendorId, name: "", saved_at: new Date().toISOString() }, ...list],
      });
      // Whatever happened, the server's list is the truth afterwards — it also
      // fills in the facts Compare shows for a vendor just saved.
      void (on ? unsaveVendor(vendorId) : saveVendor(vendorId))
        .catch(() => {})
        .then(() => listSavedVendors())
        .then((r) => setState({ userId, items: r.items }))
        .catch(() => {});
    },
    [userId, items],
  );

  return {
    saved: userId ? items : [],
    canSave: Boolean(userId),
    isSaved: (id) => (items ?? []).some((v) => v.vendor_id === id),
    toggle,
  };
}
