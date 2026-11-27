import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function HomePage() {
  let signedIn = false;
  let dashboardHref = "/login";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = Boolean(user);

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      dashboardHref = profile?.role === "admin" ? "/admin" : "/dashboard";
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">CU</span>
          <span>CU Quiz</span>
        </Link>
        <nav className="nav-links">
          <Link href="/login">Sign in</Link>
          <Link className="button button-small" href={dashboardHref}>
            {signedIn ? "Open dashboard" : "Get started"}
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">CHANDIGARH UNIVERSITY · QUIZ PRACTICE</span>
          <h1>Study smarter.<br /><span>One question at a time.</span></h1>
          <p className="hero-text">
            A focused place to practise MCQs across your university subjects,
            track your attempts and build confidence before exams.
          </p>
          <div className="hero-actions">
            <Link className="button" href={dashboardHref}>
              {signedIn ? "Go to dashboard" : "Start practising"} <span aria-hidden="true">→</span>
            </Link>
            <Link className="button button-quiet" href="/login">Admin / student login</Link>
          </div>
          <div className="hero-note">
            <span className="status-dot" />
            Subject-wise practice · Four-option MCQs · Instant results
          </div>
        </div>
        <div className="hero-card">
          <div className="card-topline">
            <span className="mini-label">PRACTICE SESSION</span>
            <span className="pill">Preview</span>
          </div>
          <div className="mock-progress"><span /></div>
          <p className="question-kicker">QUESTION 04 / 10</p>
          <h2>Which concept means acting without waiting for others to direct you?</h2>
          <div className="mock-option"><span>A</span> Opportunity recognition</div>
          <div className="mock-option"><span>B</span> Calculated risk</div>
          <div className="mock-option selected"><span>C</span> Initiative <b>✓</b></div>
          <div className="mock-option"><span>D</span> Innovation</div>
          <div className="mock-footer"><span>Entrepreneurship Mindset</span><span>Sample UI</span></div>
        </div>
      </section>

      <section className="feature-strip">
        <article><span className="feature-number">01</span><h3>Pick a subject</h3><p>Browse the topics made available by the admin team.</p></article>
        <article><span className="feature-number">02</span><h3>Attempt MCQs</h3><p>Answer four-option questions at your own pace.</p></article>
        <article><span className="feature-number">03</span><h3>Review results</h3><p>See your score and keep a record of your attempts.</p></article>
      </section>
      <footer className="footer"><span>CU Quiz · Student practice platform</span><span>Built for Chandigarh University</span></footer>
    </main>
  );
}
