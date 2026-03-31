"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { fetchAuthSession, loginUser } from "@/lib/api";

import styles from "./login.module.css";

export function LoginScreen() {
  const router = useRouter();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      try {
        const session = await fetchAuthSession();
        if (!cancelled && session) {
          router.replace("/");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to verify the current login session.",
          );
        }
      }
    }

    void checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        setErrorMessage(null);
        await loginUser({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          rememberDevice: Boolean(formData.get("remember")),
        });
        router.push("/");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
      }
    });
  };

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <header className={styles.branding}>
          <h1 className={styles.title}>The Living Archive</h1>
          <p className={styles.eyebrow}>Digital Curator Workspace</p>
        </header>

        <div className={styles.card}>
          <header className={styles.cardHeader}>
            <h2>Welcome Back</h2>
            <p>Access your family&apos;s documented history and lineage records.</p>
          </header>

          {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email Address
              </label>
              <div className={styles.inputShell}>
                <span className={styles.leadingIcon} aria-hidden="true">
                  <MailIcon />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="curator@livingarchive.org"
                  className={styles.input}
                  defaultValue="curator@livingarchive.org"
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <button type="button" className={styles.textButton}>
                  Forgot Password?
                </button>
              </div>
              <div className={styles.inputShell}>
                <span className={styles.leadingIcon} aria-hidden="true">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  name="password"
                  type={isPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={styles.input}
                  defaultValue="ArchiveDemo!2026"
                  required
                />
                <button
                  type="button"
                  className={styles.visibilityToggle}
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                  onClick={() => setIsPasswordVisible((value) => !value)}
                >
                  {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <label className={styles.checkboxRow} htmlFor="remember">
              <input id="remember" name="remember" type="checkbox" className={styles.checkbox} />
              <span>Remember this device for 30 days</span>
            </label>

            <button type="submit" className={styles.submitButton} disabled={isPending}>
              <span>{isPending ? "Opening Archive…" : "Sign In to Archive"}</span>
              <ArrowIcon />
            </button>
          </form>

          <footer className={styles.footer}>
            <p>
              New to the Archive?
              <button type="button" className={styles.footerButton}>
                Request Curator Access
              </button>
            </p>
            <p className={styles.supportCopy}>
              Local development is bootstrapped with a Postgres-backed curator account.
            </p>
            <Link href="/" className={styles.backLink}>
              Return to workspace preview
            </Link>
          </footer>
        </div>

        <div className={styles.securityRow}>
          <div className={styles.securityItem}>
            <ShieldIcon />
            <span>End-to-End Encryption</span>
          </div>
          <div className={styles.separator} aria-hidden="true" />
          <div className={styles.securityItem}>
            <VaultIcon />
            <span>Secure Vault Storage</span>
          </div>
        </div>
      </section>

      <div className={styles.bottomBar} aria-hidden="true" />
    </main>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Z" />
      <path d="m5 7 7 5 7-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 1 1 8 0V10" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.3A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.1 3.8" />
      <path d="M6.7 6.8A17.2 17.2 0 0 0 2.5 12s3.5 6 9.5 6c1 0 1.9-.2 2.8-.4" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 5 2.8 7.8 7 10 4.2-2.2 7-5 7-10V6l-7-3Z" />
      <path d="m9.4 12 1.8 1.8 3.8-4.1" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8v1.2" />
      <path d="M15.1 12H13.9" />
      <path d="M12 15.2V14" />
      <path d="M10.1 12H8.9" />
    </svg>
  );
}
