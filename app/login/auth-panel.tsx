"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signUp } from "@/app/actions";
import GoogleSignInButton from "./google-sign-in-button";

type Props = {
  configured: boolean;
  initialMode: "signin" | "signup";
  error?: string;
  message?: string;
};

export default function AuthPanel({ configured, initialMode, error, message }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const isSignUp = mode === "signup";

  return (
    <section className="auth-content auth-content-standard">
      <div className="auth-content-heading">
        <span className="auth-section-label">CU QUIZ ACCOUNT</span>
        <h2>{isSignUp ? "Create your account" : "Welcome back"}</h2>
        <p>{isSignUp
          ? "Join CU Quiz and start practising your university subjects."
          : "Sign in to pick up where your preparation left off."}</p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button
          className={"auth-tab" + (!isSignUp ? " active" : "")}
          type="button"
          role="tab"
          aria-selected={!isSignUp}
          onClick={() => { setMode("signin"); setShowPassword(false); }}
        >
          Sign in
        </button>
        <button
          className={"auth-tab" + (isSignUp ? " active" : "")}
          type="button"
          role="tab"
          aria-selected={isSignUp}
          onClick={() => { setMode("signup"); setShowPassword(false); }}
        >
          Create account
        </button>
      </div>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}

      {!configured && (
        <div className="notice notice-error">
          Supabase is not connected. Add your Supabase URL and publishable key to the environment settings.
        </div>
      )}

      {configured && (
        <>
          <GoogleSignInButton />
          <div className="auth-divider"><span>or continue with email</span></div>
        </>
      )}

      {isSignUp ? (
        <form action={signUp} className="auth-form">
          <input type="hidden" name="mode" value="signup" />
          <div className="field">
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              name="full_name"
              type="text"
              placeholder="Enter your full name"
              autoComplete="name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <div className="auth-label-row">
              <label htmlFor="signup-password">Password</label>
              <span>At least 8 characters</span>
            </div>
            <div className="auth-password-wrap">
              <input
                id="signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                minLength={8}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button className="button auth-submit" type="submit" disabled={!configured}>
            Create student account <span aria-hidden="true">→</span>
          </button>
          <p className="auth-form-note">
            Admin access is assigned separately by the project owner.
          </p>
        </form>
      ) : (
        <form action={signIn} className="auth-form">
          <input type="hidden" name="mode" value="signin" />
          <div className="field">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <div className="auth-label-row">
              <label htmlFor="login-password">Password</label>
            </div>
            <div className="auth-password-wrap">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button className="button auth-submit" type="submit" disabled={!configured}>
            Sign in <span aria-hidden="true">→</span>
          </button>
        </form>
      )}

      <div className="auth-panel-footer">
        <span>By continuing, you agree to use CU Quiz responsibly.</span>
        <Link href="/">Back to home</Link>
      </div>
    </section>
  );
}
