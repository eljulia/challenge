# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

**KOL** is a React/TypeScript application for business leaders to discover content and generate LinkedIn posts via AI. This repository is a **candidate challenge version** — it contains intentional bugs across 8 product areas that must be identified, fixed, and documented.

All AI and LinkedIn integrations are **fake/simulated**. The Edge Function `generate-posts` builds post text from article content without calling any external AI API. The LinkedIn scheduling flow only saves state to Supabase. LinkedIn login is explicitly disabled: `authMethods.loginWithLinkedIn()` returns `{ success: false }`.

## Commands

```powershell
# Install dependencies (use npm, not bun — bun.lock is present but npm is the chosen manager)
npm install

# Setup env (first time)
Copy-Item .env.example .env.local
# Then fill VITE_SUPABASE_ANON_KEY with the key printed by supabase start

# Start local Supabase (requires Docker Desktop running)
supabase start
supabase db reset          # loads seed.sql with demo users and articles
supabase functions serve   # must stay running in a separate terminal

# Run dev server (port 8080, not 5173)
npm run dev
# If PowerShell blocks npm:
npm.cmd run dev

# Lint
npm run lint

# Build
npm run build
```

There are no test commands — no test suite exists in this repo.

## Local URLs

| Service | URL |
|---|---|
| App | `http://localhost:8080` |
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |

## Demo Credentials

| Email | Password | Points | Seeded Topics |
|---|---|---|---|
| `demo.a@example.test` | `Challenge123!` | 120 | AI marketing, founder storytelling |
| `demo.b@example.test` | `Challenge123!` | 60 | sales operations, customer retention |
| `demo.c@example.test` | `Challenge123!` | 0 | local services, automation |

---

## Architecture

### Frontend Stack

- **React 18 + TypeScript 5.5 + Vite 5 (SWC)** — `@` alias resolves to `./src/`
- **React Router 6** — routes in `src/App.tsx`; heavy pages lazy-loaded via `React.lazy`
- **TanStack Query 5** — cache persisted to `localStorage` keyed `kol-query-cache`, busted by `APP_VERSION` (`src/config/version.ts` → `2.0.9`)
- **shadcn/ui** (Radix UI) — all primitive components in `src/components/ui/`
- **Tailwind CSS 3.4** — utility-first styles
- **Sentry** — initialized in `src/lib/sentry.ts` before the React tree mounts; disabled in dev

### Routes & Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | `Index` | Redirects to `/dashboard` or `/login` based on auth state |
| `/login` | `Login` | Email/password auth + quick-login buttons for 3 demo users |
| `/onboarding` | `Onboarding` | First-run preferences form → upserts to `profiles` table |
| `/dashboard` | `Dashboard` | Points balance, leaderboard (top 5), point redemption |
| `/topics` | `TopicSelection` | Browse all articles, select and save to `user_articles` |
| `/generated` | `GeneratedPosts` | Generate posts via Edge Function, edit, schedule |
| `/profile` | `Profile` | Email, preferences display, points balance, fake LinkedIn status |

**Public routes** (no auth required): `/`, `/login`, `/terms`, `/account-deletion`, `/auth/callback*` — enforced by `src/components/AuthGuard.tsx`.

### State Management

Three React Contexts + TanStack Query:

| Layer | File | Responsibility |
|---|---|---|
| `AuthContext` | `src/contexts/AuthContext.tsx` | Session state via `useAuthState`; exposes `user`, `session`, `loginWithLinkedIn`, `logout` |
| `OnboardingContext` | `src/contexts/OnboardingContext.tsx` | Multi-step onboarding state (`currentStep` 0-4, `preferences`) |
| `ImpersonationContext` | `src/contexts/ImpersonationContext.tsx` | Super-admin impersonation; `effectiveUserId` used for all queries when active |

Auth methods are in `src/utils/authMethods.ts` (not in the context). The context delegates to it.

The **challenge-mode pages** (`Dashboard`, `Onboarding`, `GeneratedPosts`, `TopicSelection`, `Profile`) do **not** use TanStack Query — they fetch directly with the Supabase client and manage state with `useState`.

### Hooks

| Hook | File | Purpose |
|---|---|---|
| `useAuthState` | `src/hooks/useAuthState.ts` | Subscribes to `onAuthStateChange`, returns `(state, setState)` |
| `usePostsQuery` | `src/hooks/usePostsQuery.ts` | Posts list; auto-refetches every 3s if any post is in `"generating"` status; uses admin RPC when impersonating |
| `useProfileData` | `src/hooks/useProfileData.ts` | Loads and reconciles 3 keyword formats: `fixedKeywords` (auto from industries), `preferredKeywords` (custom), `keywords` (combined for scoring) |
| `usePersonalizedArticles` | `src/hooks/usePersonalizedArticles.ts` | Fetches and scores articles; weights: keyword 60%, industry 20%, recency 15%, language 5% |
| `useInfiniteArticles` | `src/hooks/useInfiniteArticles.ts` | Infinite scroll for general articles (10/page); also exports `useInfiniteSESArticles` |
| `useInfinitePersonalizedArticles` | `src/hooks/useInfinitePersonalizedArticles.ts` | Infinite scroll with 4 fetch groups: trusted sources, self-trusted, specific source, recommended |
| `useSuggestedKeywords` | `src/hooks/useSuggestedKeywords.ts` | Suggests keywords from selected industries; depends on react-hook-form `watch` |
| `useLinkedInTokenValidation` | `src/hooks/useLinkedInTokenValidation.ts` | Validates LinkedIn token via RPC `get_my_linkedin_token_status`; 15s grace period after login |

### Article Scoring System

`src/utils/articleScoring.ts` and `src/utils/articleFiltering.ts` implement a multiplicative scoring pipeline:

- **Base score components**: keyword match (100 pts single / 80×ratio multiple), industry (50 pts match / 30 global), region (0-25 proportional), language (15 preferred / 12 second)
- **Recency multiplier**: applied on top of base score
- **"For You" tab** uses different weights than general tab
- Merge strategy in `useInfinitePersonalizedArticles`: recent manual → recent recommended (if <48h) → rest, with keyword match as tiebreaker

### Backend / Supabase

- **Client**: `src/integrations/supabase/client.ts` — reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; session persisted in `localStorage`
- **Types**: `src/integrations/supabase/types.ts` — auto-generated; treat as source of truth for DB shape
- **Edge Function**: `supabase/functions/generate-posts/index.ts` — Deno runtime; requires valid JWT in `Authorization` header; validates `user.id === request.user_id`; inserts post with `status: "revision"`; returns `{ post, fake: true }`

### Key Database Tables

| Table | RLS | Notes |
|---|---|---|
| `profiles` | `auth.uid() = id` (read/write) | `preferences` (JSONB), `current_month_points`, `display_name` |
| `articles` | All authenticated users can SELECT | Global article pool |
| `sources` | All authenticated users can SELECT | Article sources |
| `user_articles` | `auth.uid() = user_id` | Junction: user ↔ saved article |
| `posts` | `auth.uid() = user_id` (all ops) | Generated posts; statuses: `revision`, `scheduled`, `published`, `generating`, `failed` |

The final migration `supabase/migrations/20260512120000_challenge_mode_seed_support.sql` is the authoritative RLS definition. Read it first when debugging permission errors.

Notable RPCs (SECURITY DEFINER):
- `get_my_linkedin_token_status()` — returns `has_token + expires_at` without exposing the raw token
- `increment_user_goal_posts()` — atomic weekly post count increment
- `get_user_role(user_email)` — used by impersonation context

### App Configuration (`src/config/`)

- `version.ts` — `APP_VERSION = "2.0.9"`, `BUILD_NUMBER = 47`; used to bust query cache on deploy
- `preferences.ts` — constants for REGIONS (6), LANGUAGES (5+None), INDUSTRIES (16), and `keywordsByIndustry` map
- `accessControl.ts` — `REQUIRE_EMAIL_WHITELIST = false`; when true only emails in `allowed_emails` table can access the app

### Types (`src/types/`)

```typescript
// auth.ts
interface AuthState { user, session, isLoading, error }
interface AuthContextType extends AuthState { loginWithLinkedIn, logout }

// profile.ts
interface UserPreferences {
  region: string[];
  preferredLanguage: string;
  secondLanguage: string;
  industries: string[];
  keywords: string[];          // combined array used for scoring
  fixedKeywords: string[];     // auto-derived from industries
  preferredKeywords: string[]; // user-defined custom keywords
  trustedMedia: string[];
  trustedSourceIds: string[];
  matchedTrustedSourceIds?: string[];
}
```

### Mobile (Capacitor)

The app wraps with Capacitor 7 for Android/iOS. `src/utils/mobileUtils.ts` exposes `isCapacitorNative()`, `getPlatform()`, `shouldUseNativeAuth()`. All native code (notifications, app lifecycle) is guarded by `isCapacitorNative()`. The app ID switches based on `APP_VARIANT` env var: `testflight` → `com.newbrain.kol.ios`, default → `com.newbrain.kol.ses`. Mobile build setup is not required for the challenge.

---

## Intentional Bugs (Challenge Areas)

These are confirmed bugs in the codebase — do not treat as correct behavior:

| # | File | Line | Severity | Description |
|---|---|---|---|---|
| 1 | `src/pages/TopicSelection.tsx` | 25-27, 136 | High | `brokenExtractTitle(_article, index)` ignores `_article` and returns `"Article N+1"` instead of `article.title` |
| 2 | `src/pages/Dashboard.tsx` | 52 | High | `redeemPoints()` deducts from `leaderboard[0].id` (top-ranked user) instead of `profile.id` (current user) |
| 3 | `src/pages/GeneratedPosts.tsx` | 106-110 | Medium | `saveEdit()` fires a success toast but never calls Supabase `update` — changes are lost on reload |
| 4 | `src/pages/GeneratedPosts.tsx` | 207 | Medium | Scheduled post preview reads `post.articles?.image_url` but the DB column is `imageurl` (no underscore) — always `undefined` |
| 5 | `src/pages/Onboarding.tsx` | 78 | Medium | `upsert` always overwrites `display_name` from `user.email.split("@")[0]`, ignoring any previously saved name |

Additional area to investigate:
- **Leaderboard / RLS**: `profiles` SELECT policy is `auth.uid() = id`, meaning the leaderboard query in `Dashboard.tsx` (which fetches top 5 profiles) will only return the current user's own row — the other 4 entries are blocked by RLS.

---

## Deliverables

- `SOLUTION.md` — bugs found, changes made, how you tested
- Short demo video (3–5 min, Spanish preferred) showing the 12-step happy path
- Private GitHub repo with `sebastian.serna@castleberrymedia.co` and `david.romero@castleberrymedia.co` as collaborators

**Security — verify before push:**
- No `.env` files committed
- No production Supabase URLs or `service_role` keys
- No real LinkedIn OAuth or paid API keys
- No `SOLUTIONS.md` (plural) — `.gitignore` excludes it; use `SOLUTION.md` (singular)
