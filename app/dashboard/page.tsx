import Link from "next/link";
import { signOut } from "@/app/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile?.role === "admin") {
    return (
      <main className="app-shell">
        <div className="panel">
          <h1 className="page-heading">You have an admin account.</h1>
          <p className="page-subtitle">Open the admin workspace to manage subjects and questions.</p>
          <Link className="button" href="/admin" style={{ marginTop: 20 }}>Open admin workspace</Link>
        </div>
      </main>
    );
  }

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, slug, description")
    .eq("is_active", true)
    .order("name");

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, subject_id, score, total_questions, completed_at")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(5);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <Link className="brand" href="/"><span className="brand-mark">CU</span><span>CU Quiz</span></Link>
          <h1 className="page-heading" style={{ marginTop: 28 }}>Your learning space</h1>
          <p className="page-subtitle">Welcome, {profile?.full_name || user.email}. Choose a subject and start practising.</p>
        </div>
        <div className="app-header-actions">
          <form action={signOut}><button className="button button-quiet button-small" type="submit">Sign out</button></form>
        </div>
      </header>

      <section>
        <div className="section-heading">
          <h2>Available subjects</h2>
          <span className="muted">{subjects?.length ?? 0} subjects</span>
        </div>
        {subjects && subjects.length > 0 ? (
          <div className="subject-grid">
            {subjects.map((subject, index) => (
              <Link className="subject-card" href={"/quiz/" + subject.id} key={subject.id}>
                <div className="subject-icon">{String(index + 1).padStart(2, "0")}</div>
                <h3>{subject.name}</h3>
                <p>{subject.description || "Practise multiple-choice questions for this subject."}</p>
                <div className="subject-foot"><span>Start practice</span><span aria-hidden="true">→</span></div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">No subjects have been published yet. Check back later.</div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 30 }}>
        <div className="section-heading"><h2>Recent attempts</h2><span className="muted">Your latest results</span></div>
        {attempts && attempts.length > 0 ? (
          <div className="table-scroll">
            <table className="table-list">
              <thead><tr><th>Completed</th><th>Score</th><th>Result</th></tr></thead>
              <tbody>{attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{new Date(attempt.completed_at).toLocaleString()}</td>
                  <td>{attempt.score} / {attempt.total_questions}</td>
                  <td><Link href={"/result/" + attempt.id}>View result →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">Your completed quizzes will appear here.</p>}
      </section>
    </main>
  );
}
