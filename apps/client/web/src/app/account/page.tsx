"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { changePassword, updateMe, uploadAvatar } from "@/lib/jorna";
import { checkImageFiles, describeRejections } from "@jorna/shared/lib/uploads";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { signInUrl, vendorSiteUrl } from "@/lib/vendorSite";
import { DARK_MODE_ENABLED, PUSH_ENABLED } from "@jorna/shared/lib/flags";
import { disableWebPushForThisDevice } from "@jorna/shared/lib/push";
import { PushOptIn } from "@jorna/shared/components/PushOptIn";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FormSkeleton } from "@/components/Skeletons";

const SECTIONS = ["Profile", "Password & sign-in", "Notifications", "Privacy"] as const;

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
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Profile");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace(signInUrl("/account"));
  }, [authLoading, user, router]);

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

  if (authLoading || !user) {
    return <FormSkeleton label="Loading your account…" />;
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
      logout();
      window.location.replace(signInUrl("/account"));
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Couldn't change your password.");
      setChangingPw(false);
    }
  }

  const name = [user.f_name, user.l_name].filter(Boolean).join(" ") || user.username;

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-11">
      <p className="eyebrow">Your details</p>
      <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[3.2rem]">Account</h1>

      <div className="mt-7 grid gap-6 desk:grid-cols-[220px_minmax(0,640px)]">
        <aside>
          <nav aria-label="Account sections" className="flex gap-1 overflow-x-auto desk:grid">
            {SECTIONS.map((item) => (
              <button
                key={item}
                type="button"
                aria-current={section === item ? "page" : undefined}
                onClick={() => setSection(item)}
                className={`shrink-0 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold ${
                  section === item ? "bg-card text-ink" : "text-ink-soft hover:bg-card"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-4 border-t border-line pt-4">
            <Button
              variant="quiet"
              onClick={async () => {
                // Unregister this browser's push token first — it needs the
                // session — so a shared computer stops pinging after sign-out.
                await disableWebPushForThisDevice(user.user_id);
                logout();
              }}
            >
              Sign out
            </Button>
          </div>
        </aside>

        <section aria-label={section}>
          {section === "Profile" ? (
            <>
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
      <Card className="mt-6 p-6">
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
            <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
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

              <Card className="mt-6 p-5">
                <p className="text-sm text-ink-soft">
                  Offer your packages on Jorna — vendors sign up and work on jornaevents.com.
                </p>
                <a href={vendorSiteUrl("/login?mode=register&role=vendor")} className="mt-3 inline-block text-sm font-semibold text-gold hover:underline">
                  Start selling
                </a>
              </Card>
            </>
          ) : null}

          {section === "Password & sign-in" ? (
            <>
      {/* Password */}
      <Card className="p-6">
        <h2 className="serif text-xl text-ink">Password &amp; sign-in</h2>
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
            <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
              {pwErr}
            </p>
          ) : null}
          <Button type="submit" variant="ghost" disabled={changingPw}>
            {changingPw ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>

            </>
          ) : null}

          {section === "Notifications" ? (
            <Card className="p-6">
              <h2 className="serif text-xl text-ink">Notifications</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Contracts, payment reminders and vendor replies are emailed to <strong className="text-ink">{user.email}</strong>.
                Change the address under Profile.
              </p>
              {PUSH_ENABLED ? (
                <div className="mt-4 [&>*]:mb-0">
                  <PushOptIn showWhenOn />
                </div>
              ) : null}
            </Card>
          ) : null}

          {section === "Privacy" ? (
            <div className="grid gap-6">
              <Card className="divide-y divide-line-soft p-0">
                <Link href="/blocked" className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                  <span>
                    <strong className="block text-ink">Blocked people</strong>
                    <span className="text-ink-soft">You won&apos;t see their messages or reviews.</span>
                  </span>
                  <span className="text-ink-faint">›</span>
                </Link>
                {DARK_MODE_ENABLED ? (
                  <div className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                    <span>
                      <strong className="block text-ink">Dark mode</strong>
                      <span className="text-ink-soft">Use Jorna&apos;s evening palette.</span>
                    </span>
                    <ThemeToggle />
                  </div>
                ) : null}
              </Card>
              <DeleteAccountSection />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
