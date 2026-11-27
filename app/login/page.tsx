import Link from "next/link";
import AuthPanel from "./auth-panel";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Props = {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="auth-wrap auth-wrap-standard">
      <section className="auth-card auth-card-standard">
        <aside className="auth-aside auth-aside-standard">
          <Link className="brand" href="/">
            <span className="brand-mark">CU</span>
            <span>CU Quiz</span>
          </Link>

          <div className="auth-aside-copy">
            <span className="eyebrow">CHANDIGARH UNIVERSITY</span>
            <h1>Make every practice session count.</h1>
            <p>
              Build confidence one question at a time. Practise your subjects,
              track your attempts and see your progress.
            </p>
            <div className="auth-feature-list">
              <div><span>✓</span><p>Subject-wise MCQ practice</p></div>
              <div><span>✓</span><p>Randomized questions and options</p></div>
              <div><span>✓</span><p>Instant scores and saved attempts</p></div>
            </div>
          </div>

          <div className="auth-aside-bottom">
            <span className="auth-aside-dot" />
            <span>Made for CU of students by students of CU</span>
          </div>
        </aside>

        <AuthPanel
          configured={isSupabaseConfigured()}
          initialMode={params.mode === "signup" ? "signup" : "signin"}
          error={params.error}
          message={params.message}
        />
      </section>
    </main>
  );
}
