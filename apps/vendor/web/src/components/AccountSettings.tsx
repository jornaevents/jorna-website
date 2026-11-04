"use client";

// Your own account — name, contact details, photo, password. The same forms
// on /account and on the vendor app's Settings page, so they're written once.
// The caller owns the signed-out redirect; this renders nothing without a user.

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { changePassword, updateMe, uploadAvatar } from "@/lib/jorna";
import { checkImageFiles, describeRejections } from "@jorna/shared/lib/uploads";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { AiSummarySetting } from "@jorna/shared/components/AiSummarySetting";

/** `loginNext`: where to come back to after the forced sign-in a password change causes. */
export function AccountSettings({ loginNext }: { loginNext: string }) {
  const { user, setUser, logout } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  // Profile
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

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

  if (!user) return null;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const updated = await updateMe({
        f_name: fName,
        l_name: lName,
        email,
        phone: phone || null,
        location,
      });
      setUser(updated);
      setProfileMsg("Saved.");
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onAvatar(file: File | undefined) {
    if (!file || !user) return;
    const { ok, rejected } = checkImageFiles([file]);
    if (rejected.length) {
      setProfileErr(`Skipped: ${describeRejections(rejected)}.`);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploading(true);
    setProfileErr(null);
    try {
      const { pfp_url } = await uploadAvatar(ok[0]);
      setUser({ ...user, pfp_url });
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setChangingPw(true);
    setPwErr(null);
    try {
      await changePassword(currentPw, newPw);
      // The backend invalidates the current session on a password change, so
      // sign out cleanly and send them to sign in with the new password.
      logout(`/login?next=${loginNext}`);
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Couldn't change your password.");
      setChangingPw(false);
    }
  }

  const name = [user.f_name, user.l_name].filter(Boolean).join(" ") || user.username;

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
        {uploading ? "Uploading…" : "Change photo"}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onAvatar(e.target.files?.[0])}
        />
      </label>
    </div>

    {/* Profile */}
    <Card className="mt-7 p-6">
      <form onSubmit={saveProfile} className="grid gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" value={fName} onChange={(e) => setFName(e.target.value)} />
          <Field label="Last name" value={lName} onChange={(e) => setLName(e.target.value)} />
        </div>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <CityCombobox
            label="City & state"
            placeholder="Start typing a city…"
            value={location}
            onChange={(v) => setLocation(v)}
          />
        </div>
        {profileErr ? (
          <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {profileErr}
          </p>
        ) : null}
        {profileMsg ? (
          <p className="rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{profileMsg}</p>
        ) : null}
        <Button type="submit" disabled={savingProfile}>
          {savingProfile ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Card>

    {/* Password */}
    <AiSummarySetting
      className="mt-6"
      enabled={user.ai_summaries_enabled !== false}
      onChange={async (next) => setUser(await updateMe({ ai_summaries_enabled: next }))}
    />

    <Card className="mt-6 p-6">
      <h2 className="serif text-xl text-ink">Change password</h2>
      <form onSubmit={changePw} className="mt-4 grid gap-4">
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters. You'll sign in again afterward."
          required
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        {pwErr ? (
          <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {pwErr}
          </p>
        ) : null}
        <Button type="submit" variant="ghost" disabled={changingPw}>
          {changingPw ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Card>
    </div>
  );
}
