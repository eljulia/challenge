# Technical Challenge

This repository contains a simplified version of the product with intentional issues.

Your task is to run the app locally, identify the issues, fix them, and demonstrate that the main product flow works end to end.

You do not need a hosted Supabase project. This challenge runs against local Supabase using Docker and the Supabase CLI.

## Product Areas

You should investigate and validate these areas:

1. Onboarding and preference saving.
2. Dashboard scoring and point redemption.
3. Search Topics and article extraction/display.
4. Saving selected articles.
5. Fake API-backed post generation through a Supabase Edge Function.
6. Generated post editing.
7. Fake LinkedIn scheduling and scheduled preview.
8. Simplified Profile page.

The app should feel like a small real product, but all data and integrations are synthetic.

## Expected Working Flow

By the end of your fix, a user should be able to:

1. Sign in as a seeded demo user.
2. Complete onboarding and save preferences.
3. Refresh the app without losing preferences.
4. View the dashboard and use points safely.
5. Search/load demo articles.
6. Save selected articles to Supabase.
7. Generate a post from a saved article using the fake Edge Function.
8. Edit generated post content and see the saved result.
9. Schedule the post locally.
10. View a scheduled post preview with correct article context.
11. Open the original article from the preview.
12. View email, preferences, points, and fake LinkedIn status on Profile.

## Prerequisites

Install these before starting:

- Node.js and npm
- Docker Desktop
- Supabase CLI
- Git

Docker Desktop must be running before you run Supabase commands.

## Local Setup

### macOS / Linux

```bash
npm install
cp .env.example .env.local
supabase start
```

After `supabase start`, copy the printed local anon key into `.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste local anon key here>
```

Then reset and run:

```bash
supabase db reset
supabase functions serve
npm run dev
```

### Windows PowerShell

```powershell
npm install
Copy-Item .env.example .env.local
supabase start
```

After `supabase start`, copy the printed local anon key into `.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste local anon key here>
```

Then reset and run:

```powershell
supabase db reset
supabase functions serve
npm run dev
```

If PowerShell blocks `npm`, use:

```powershell
npm.cmd run dev
```

### Windows Command Prompt

```bat
npm install
copy .env.example .env.local
supabase start
```

After `supabase start`, copy the printed local anon key into `.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste local anon key here>
```

Then reset and run:

```bat
supabase db reset
supabase functions serve
npm run dev
```

## Synthetic Data

The local database is seeded from:

```txt
supabase/seed.sql
```

Running `supabase db reset` reloads the synthetic users, profiles, article sources, articles, points, and preferences.

Demo users:

- `demo.a@example.test` / `Challenge123!`
- `demo.b@example.test` / `Challenge123!`
- `demo.c@example.test` / `Challenge123!`

## Useful Local URLs

Supabase will print the exact local URLs after `supabase start`. Common defaults are:

- App: `http://localhost:8080` (Vite is configured to use port 8080, not the default 5173)
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`

## Notes

- Do not use real API keys.
- Do not connect to the real LinkedIn API.
- Do not connect to a production Supabase project.
- The post generation function is intentionally fake but should behave like a real API-backed flow.
- The scheduling flow is fake and should only save scheduled posts locally/Supabase.

## Candidate Deliverables

You have read-only access to this repository.

To submit your solution:

1. Clone this repository.
2. Create your own private GitHub repository with your fixed solution.
3. Add `sebastian.serna@castleberrymedia.co` and `david.romero@castleberrymedia.co` as a collaborator so we can review the code.
4. Share the repository link with us.
5. Include the code changes needed to fix the challenge.
6. Include a short `SOLUTION.md` file explaining:
   - Which issues you found.
   - What you changed.
   - How you tested the app.
7. Include a short demo video showing the main flow working.

It's not mandatory to deploy the app.

The app needs to work locally using Supabase CLI and Docker.

## Use of AI Tools

You may use AI tools during this challenge.

However, your submission must demonstrate that you understood the codebase, the bugs, and the reasoning behind your fixes.

Using AI-generated code without understanding it is not considered a strong submission.

We will evaluate the reasoning behind your solution, not just whether the final code runs.

## Evaluation Criteria

- 20% Onboarding and preferences save correctly
- 20% Dashboard points logic works correctly
- 20% Article extraction/display and saving works
- 20% Fake post generation, edit, and schedule flow works
- 10% Supabase/Auth/RLS/Edge Function understanding
- 10% Code quality, debugging explanation, and setup clarity

Bonus:

- Clean error handling
- Good loading states
- Clear database structure
- Good comments explaining fake API behavior
- Optional Capacitor/mobile verification

## Security Rules

Before submitting, verify:

- No real secrets are committed
- No `.env` files are committed
- No production Supabase URL is included
- No service role key exists
- No real user/customer data exists
- No real LinkedIn OAuth flow is active
- No paid API key is required
- No private internal assets remain
