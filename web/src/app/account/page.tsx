"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { changePassword, updateMe, uploadAvatar } from "@/lib/jorna";
import { checkImageFiles, describeRejections } from "@/lib/uploads";
import { Button, Card, Field } from "@/components/ui";
import { CityCombobox } from "@/components/CityCombobox";

export default function AccountPage() {
  const { user, loading: authLoading, setUser, logout } = useAuth();
  const router = useRouter();
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

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/account");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setFName(user.f_name ?? "");
    setLName(user.l_name ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setLocation(user.location ?? "");
  }, [user]);

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

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
    if (!file) return;
    const { ok, rejected } = checkImageFiles([file]);
    if (rejected.length) {
      setProfileErr(`Skipped: ${describeRejections(rejected)}.`);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploading(true);
    setProfileErr(null);
    try {
      const updated = await uploadAvatar(ok[0]);
      setUser(updated);
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
      logout();
      router.replace("/login?next=/account");
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Couldn't change your password.");
      setChangingPw(false);
    }
  }

  const name = [user.f_name, user.l_name].filter(Boolean).join(" ") || user.username;

  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-10">
      <Link href="/profile" className="text-sm text-ink-soft hover:text-ink">
        ← Profile
      </Link>
      <h1 className="serif mt-4 text-3xl text-maroon dark:text-gold">Account settings</h1>

      {/* Avatar */}
      <div className="mt-7 flex items-center gap-4">
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

      <div className="mt-8">
        <Button variant="quiet" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
