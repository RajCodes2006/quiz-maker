import Link from "next/link";
import { signIn, signUp } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <aside className="auth-aside">
          <Link className="brand" href="/">
            <span className="brand-mark">CU</span><span>CU Quiz</span>
          </Link>
          <div>
            <h1>Your next<br />practice session<br />starts here.</h1>
            <p>Sign in to practise Chandigarh University subjects or manage the question bank.</p>
          </div>
          <small>CU Quiz · Chandigarh University</small>
        </aside>
        <div className="auth-content">
          <h2>Welcome back</h2>
          <p>Use your email and password to continue.</p>
          {!isSupabaseConfigured() && (
            <div className="notice notice-error">
              Supabase is not connected yet. Copy .env.example to .env.local and add your project URL and publishable key.
            </div>
          )}
          {params.error && <div className="notice notice-error">{params.error}</div>}
          {params.message && <div className="notice">{params.message}</div>}

          <form action={signIn}>
            <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required /></div>
            <button className="button" type="submit" style={{ width: "100%" }}>Sign in</button>
          </form>

          <div className="form-divider" />
          <div className="form-section-title">New to CU Quiz?</div>
          <p className="muted">Create a student account. Admin access is granted separately by the project owner.</p>
          <form action={signUp}>
            <div className="field"><label htmlFor="signup-name">Full name</label><input id="signup-name" name="full_name" autoComplete="name" required /></div>
            <div className="field"><label htmlFor="signup-email">Email address</label><input id="signup-email" name="email" type="email" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="signup-password">Password (8+ characters)</label><input id="signup-password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
            <button className="button button-quiet" type="submit" style={{ width: "100%" }}>Create student account</button>
          </form>
          <p className="muted" style={{ marginTop: 22 }}><Link href="/">← Back to home</Link></p>
        </div>
      </section>
    </main>
  );
}
