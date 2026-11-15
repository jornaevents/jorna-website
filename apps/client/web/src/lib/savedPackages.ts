"use client";

// The client's saved packages (backend 0090), for Explore's hearts and the
// Compare table. Packages, not vendors: one vendor's $38-a-head dinner and
// $8,000 buffet are different things to weigh, and a card is one package. Saved on the account, so the shortlist follows them across
// devices. A heart flips at once and is put back if the save fails.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listSavedPackages, savePackage, unsavePackage, type SavedPackage } from "@/lib/jorna";

export function useSavedPackages(): {
  /** Null while loading; empty for a signed-out visitor. */
  saved: SavedPackage[] | null;
  /** False for a signed-out visitor, who gets no hearts. */
  canSave: boolean;
  isSaved: (serviceId: string) => boolean;
  toggle: (serviceId: string) => void;
} {
  const { user } = useAuth();
  // Kept with the user it was loaded for, so one account never sees another's.
  const [state, setState] = useState<{ userId: string; items: SavedPackage[] } | null>(null);
  const userId = user?.user_id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listSavedPackages()
      .then((r) => !cancelled && setState({ userId, items: r.items }))
      .catch(() => !cancelled && setState({ userId, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const items = userId && state?.userId === userId ? state.items : null;

  const toggle = useCallback(
    (serviceId: string) => {
      if (!userId) return;
      const list = items ?? [];
      const on = list.some((p) => p.service_id === serviceId);
      setState({
        userId,
        items: on
          ? list.filter((p) => p.service_id !== serviceId)
          : // A placeholder until the server's list lands with the real facts.
            [{ service_id: serviceId, name: "", available: true, price: 0, inclusions: [], add_ons: [], negotiable: false, vendor_id: "", vendor_name: "", saved_at: new Date().toISOString() }, ...list],
      });
      // Whatever happened, the server's list is the truth afterwards — it also
      // fills in the facts Compare shows for a package just saved.
      void (on ? unsavePackage(serviceId) : savePackage(serviceId))
        .catch(() => {})
        .then(() => listSavedPackages())
        .then((r) => setState({ userId, items: r.items }))
        .catch(() => {});
    },
    [userId, items],
  );

  return {
    saved: userId ? items : [],
    canSave: Boolean(userId),
    isSaved: (id) => (items ?? []).some((p) => p.service_id === id),
    toggle,
  };
}
