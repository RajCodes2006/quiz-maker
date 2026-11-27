# CU Quiz

A subject-wise MCQ practice platform for Chandigarh University. Students can practise randomized quizzes, track their attempts, and review results. Admins manage subjects and question banks.

## Features

### For students
- Email/password registration and sign-in.
- Google sign-in through Supabase Auth.
- Student dashboard with active subjects and recent attempts.
- Choose a quiz length of **10, 20, 40, or 80 questions**, depending on the published question pool.
- Random question selection and shuffled option order for each quiz.
- One-question-at-a-time interface with progress, previous/next navigation, and answer tracking.
- Server-side scoring and saved results.

### For admins
- Role-protected admin workspace.
- Create subjects and four-option MCQs.
- Import questions in bulk using a CSV file (up to 500 rows and 1 MB per upload).
- Keep correct answers in a separate answer-key table.

## Tech stack

- **Framework:** Next.js 16 App Router
- **Language:** TypeScript
- **UI:** React 19
- **Authentication and database:** Supabase Auth + PostgreSQL
- **Database security:** Row Level Security (RLS), explicit grants, and server-only data access
- **Hosting and observability:** Vercel, Vercel Analytics, and Speed Insights
- **Automation:** GitHub Actions CI and Dependabot

## Requirements

- Node.js 22 or later
- npm
- A Supabase project
- A Vercel account for deployment

## Run locally

1. Clone this repository:

   ```bash
   git clone https://github.com/RajCodes2006/quiz-maker.git
   cd quiz-maker
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Set the required environment variables in `.env.local`:

   | Variable | Description |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `NEXT_PUBLIC_SITE_URL` | App URL, such as `http://localhost:3000` locally |
   | `SUPABASE_SECRET_KEY` | Server-only Supabase secret key used by trusted server code |

5. In the Supabase SQL Editor, run the database scripts in this order:
   1. `supabase/schema.sql`
   2. `supabase/security-hardening.sql`

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

**Never** expose `SUPABASE_SECRET_KEY` through a `NEXT_PUBLIC_*` variable or commit `.env.local` (or any file containing real credentials) to GitHub.

## Configure Supabase Auth

In your Supabase project:

1. Set the Auth **Site URL** to your application URL.
2. Add the relevant callback URLs to the allowed redirect URLs:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
   - Add any Vercel preview callback URLs you intend to use.
3. Configure email confirmation according to your project's requirements.

### Enable Google sign-in

1. Create a Google OAuth client in Google Cloud Console.
2. Add Supabase's Google callback URL as an authorized redirect URI:

   ```text
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

3. Enable the **Google** provider in Supabase Authentication and enter the Google OAuth client ID and secret.
4. Add your app's local and production `/auth/callback` URLs to Supabase's allowed redirect URLs.

The login page starts Google OAuth with the current app origin and returns through `/auth/callback`.

## Create the first admin

New accounts are created as students. Promote an account to admin from the Supabase SQL Editor only:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'your-admin-email@example.com'
);
```

Replace the email with the account you want to promote. Then sign out and sign in again. Admins are routed to `/admin`; students are routed to `/dashboard`.

Do not add role selection to the public signup form or expose role updates to students.

## Import questions with CSV

The admin workspace includes a CSV import form. Select the destination subject and upload a CSV with these exact column names:

```csv
question_text,option_a,option_b,option_c,option_d,correct_option
```

- `correct_option` must be `A`, `B`, `C`, or `D`.
- Every question must have all four options.
- Maximum upload size: 1 MB.
- Maximum rows per import: 500 questions.
- The import is validated before insertion; invalid rows prevent the batch from being imported.
- A sample header file is available at [public/question-template.csv](public/question-template.csv).

## Security model

Security checks are enforced in both the application and the database:

- RLS is enabled on the app's public tables, with explicit grants and policies.
- Admin-only server checks protect admin pages and mutations.
- Students cannot directly read the questions table or answer-key table through the Supabase Data API.
- Quiz questions and opaque option tokens are issued through the server-side quiz-session flow; correct answers remain server-side.
- Quiz sessions are single-use and expire. Result access is restricted to the attempt owner.
- Database-backed rate limiting protects authentication, quiz, and admin operations. Rate-limit identifiers are hashed rather than stored as raw email addresses or IP addresses.
- Quiz APIs validate request origin, content type, and request-body size.
- Production responses use a nonce-based Content Security Policy and security headers, including HSTS, frame protection, and MIME-sniffing protection.
- The Supabase secret key is used only in server-side code.

Do not disable RLS or broaden table grants as a workaround for access errors. Fix the relevant policy or server-side query instead.

## Quality checks

Run the project's checks locally:

```bash
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

GitHub Actions runs dependency installation, the audit, automated tests, TypeScript checks, and a production build for repository changes. Dependabot checks npm dependencies and GitHub Actions updates weekly.

Database smoke tests are in `supabase/tests/`:
- `quiz-session-smoke.sql`
- `security-hardening-smoke.sql`

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Add the four environment variables listed above in the Vercel project's Environment Variables settings. Use the production URL for `NEXT_PUBLIC_SITE_URL`.
3. Add the production and required preview `/auth/callback` URLs to Supabase Auth's allowed redirect URLs.
4. Deploy the `main` branch.

No separate Render service is required. The Next.js application and its API route handlers run on Vercel.

## Project structure

```text
app/
  admin/                 Admin workspace and server actions
  api/quiz/              Quiz start and submission endpoints
  auth/callback/         Supabase OAuth callback
  dashboard/             Student dashboard
  login/                 Sign-in, registration, and Google OAuth
  quiz/[subjectId]/      Quiz setup and quiz interface
  result/[attemptId]/    Attempt result page
lib/
  auth.ts                Server-side auth and role checks
  http.ts                API request validation
  rate-limit.ts          Database-backed rate limiting
  supabase/              Supabase clients and request proxy
supabase/
  schema.sql             Base database schema
  security-hardening.sql Database security migration
  tests/                 SQL smoke tests
tests/                   Automated application tests
```

## Operational notes

- Run both SQL scripts on a new Supabase database, in the order shown above.
- If you add a new environment, update its Supabase Auth redirect allowlist.
- Keep dependencies current and review Dependabot pull requests.
- This repository includes automated checks and application/database hardening; that is not a substitute for an independent penetration test.
