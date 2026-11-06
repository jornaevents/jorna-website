"use client";

// Your own account — name, contact details, photo, password. The forms'
// state and saving live in the hooks below, written once; /account draws them
// as the old stacked cards (AccountSettings), the vendor app's Settings page
// in its own dashboard cards. The caller owns the signed-out redirect; this
// renders nothing without a user.

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import type { User } from "@jorna/shared/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { changePassword, updateMe, uploadAvatar } from "@/lib/jorna";
import { checkImageFiles, describeRejections } from "@jorna/shared/lib/uploads";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";

/** Name, email, phone, city and photo, filled from the signed-in user. */
export function useProfileForm() {
  const { user, setUser } = useAuth();
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Refill the form whenever the signed-in user changes (sign-in, or the
  // saved profile coming back) — during render, not in an effect, so the
  // form never paints a frame with the previous values.
  const [filledFrom, setFilledFrom] = useState<typeof user>(null);
  if (user && user !== filledFrom) {
    setFilledFrom(user);
    setFName(user.f_name ?? "");
    setLName(user.l_name ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setLocation(user.location ?? "");
  }

  const dirty =
    !!user &&
    (fName !== (user.f_name ?? "") ||
      lName !== (user.l_name ?? "") ||
      email !== (user.email ?? "") ||
      phone !== (user.phone ?? "") ||
      location !== (user.location ?? ""));

  // Editing again clears "Saved." — it no longer describes what's on screen.
  function edit(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      setMessage(null);
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateMe({
        f_name: fName,
        l_name: lName,
        email,
        phone: phone || null,
        location,
      });
      setUser(updated);
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  /** From the file input's change event; clears it after, so picking the
   *  same file again still fires. */
  async function uploadPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file || !user) return;
    const { ok, rejected } = checkImageFiles([file]);
    if (rejected.length) {
      setError(`Skipped: ${describeRejections(rejected)}.`);
      input.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { pfp_url } = await uploadAvatar(ok[0]);
      setUser({ ...user, pfp_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return {
    user,
    fields: { fName, lName, email, phone, location },
    setFName: edit(setFName),
    setLName: edit(setLName),
    setEmail: edit(setEmail),
    setPhone: edit(setPhone),
    setLocation: edit(setLocation),
    dirty,
    saving,
    message,
    error,
    save,
    uploading,
    uploadPhoto,
  };
}

/** `loginNext`: where to come back to after the forced sign-in a password change causes. */
export function usePasswordForm(loginNext: string) {
  const { logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      // The backend invalidates the current session on a password change, so
      // sign out cleanly and send them to sign in with the new password.
      logout(`/login?next=${loginNext}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your password.");
      setBusy(false);
    }
  }

  function reset() {
    setCurrent("");
    setNext("");
    setError(null);
  }

  return { current, setCurrent, next, setNext, busy, error, submit, reset };
}

export function displayName(user: User) {
  return [user.f_name, user.l_name].filter(Boolean).join(" ") || user.username;
}

export function AccountSettings({ loginNext }: { loginNext: string }) {
  const profile = useProfileForm();
  const password = usePasswordForm(loginNext);
  const { user, fields } = profile;

  if (!user) return null;

  const name = displayName(user);

  return (
    <div>
    {/* Avatar */}
    <div className="flex items-center gap-4">
      {user.pfp_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.pfp_url} alt="" className="size-20 rounded-full object-cover" />
      ) : (
        <div className="grid size-20 place-items-center rounded-full bg-panel serif text-3xl text-gold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <label className="cursor-pointer text-sm font-semibold text-gold hover:underline">
        {profile.uploading ? "Uploading…" : "Change photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => profile.uploadPhoto(e.currentTarget)}
        />
      </label>
    </div>

    {/* Profile */}
    <Card className="mt-7 p-6">
      <form onSubmit={profile.save} className="grid gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" value={fields.fName} onChange={(e) => profile.setFName(e.target.value)} />
          <Field label="Last name" value={fields.lName} onChange={(e) => profile.setLName(e.target.value)} />
        </div>
        <Field label="Email" type="email" value={fields.email} onChange={(e) => profile.setEmail(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" value={fields.phone} onChange={(e) => profile.setPhone(e.target.value)} />
          <CityCombobox
            label="City & state"
            placeholder="Start typing a city…"
            value={fields.location}
            onChange={(v) => profile.setLocation(v)}
          />
        </div>
        {profile.error ? (
          <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {profile.error}
          </p>
        ) : null}
        {profile.message ? (
          <p className="rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{profile.message}</p>
        ) : null}
        <Button type="submit" disabled={profile.saving}>
          {profile.saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Card>

    {/* Password */}
    <Card className="mt-6 p-6">
      <h2 className="serif text-xl text-ink">Change password</h2>
      <form onSubmit={password.submit} className="mt-4 grid gap-4">
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={password.current}
          onChange={(e) => password.setCurrent(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters. You'll sign in again afterward."
          required
          value={password.next}
          onChange={(e) => password.setNext(e.target.value)}
        />
        {password.error ? (
          <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {password.error}
          </p>
        ) : null}
        <Button type="submit" variant="ghost" disabled={password.busy}>
          {password.busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Card>
    </div>
  );
}
