# SOLUTION.md — KOL Candidate Challenge

## Summary

I identified and fixed 6 bugs across 5 files. All fixes were verified end-to-end with an automated 12-step Playwright smoke test (12/12 PASS). Each fix is isolated in its own PR with a linked GitHub Issue.

---

## Bugs Found and Fixed

### Bug 1 — Article titles not displayed (High)

**File:** `src/pages/TopicSelection.tsx` lines 25-27, 136

**Problem:** A function called `brokenExtractTitle(_article, index)` ignored the `_article` parameter entirely and returned `"Article " + (index + 1)`. Every card showed a generic title like "Article 1", "Article 2", making articles indistinguishable.

**Fix:** Removed `brokenExtractTitle` and its `ArticleRow` type stub. Added an explicit `ArticleRow` type derived from the actual Supabase columns. On line 140, replaced the function call with `article.title` directly.

**PR:** [#5](../../pull/5) `fix(topics): use article.title directly, remove brokenExtractTitle`

---

### Bug 2 — Points deducted from wrong user (High)

**File:** `src/pages/Dashboard.tsx` line 52

**Problem:** `redeemPoints()` used `leaderboard[0].id` as the target for the Supabase `UPDATE`. This deducted points from whoever was at the top of the leaderboard, not from the authenticated user. If the current user was not ranked first, their own balance never changed.

**Fix:** Replaced `leaderboard[0].id` with `profile.id`, which holds the current user's profile loaded at mount.

**PR:** [#7](../../pull/7) `fix(dashboard): deduct points from current user not leaderboard leader`

---

### Bug 3 — Post edits not persisted (Medium)

**File:** `src/pages/GeneratedPosts.tsx` lines 107-114

**Problem:** `saveEdit()` displayed a success toast but never called `supabase.from("posts").update(...)`. The edited text existed only in local React state. On any page reload the post reverted to the original AI-generated content.

**Fix:** Added `await supabase.from("posts").update({ content: draft }).eq("id", editingPost.id)` before closing the dialog. After the update, refetches posts from the DB so local state reflects what was actually saved.

**PR:** [#9](../../pull/9) `fix(posts): persist post edits to database before closing dialog`

---

### Bug 4 — Scheduled post image always blank (Medium)

**File:** `src/pages/GeneratedPosts.tsx` line 213

**Problem:** The scheduled post preview read `post.articles?.image_url` (camelCase with underscore). The actual column name in the Supabase schema is `imageurl` (no underscore). The value was always `undefined`, so the image slot rendered a grey placeholder instead of the article cover.

**Fix:** Changed `image_url` to `imageurl` to match the DB column name.

**PR:** [#11](../../pull/11) `fix(posts): use correct imageurl column name in scheduled post preview`

---

### Bug 5 — Display name overwritten on every onboarding save (Medium)

**File:** `src/pages/Onboarding.tsx` line 91

**Problem:** The `upsert` in `savePreferences()` always set `display_name` to `user.email.split("@")[0]`. Even if the user had a custom name stored in the DB, saving preferences again silently replaced it with the email prefix (e.g., `"demoa"`).

**Fix:** Added a `existingDisplayName` state variable that loads the current `display_name` from the DB on mount. The upsert now uses `existingDisplayName || user.email.split("@")[0]`, so the email fallback only applies when no name exists yet.

**PR:** [#2](../../pull/2) `fix(onboarding): preserve existing display_name on preferences save`

---

### Bug 6 — Leaderboard only shows current user (Supabase RLS)

**File:** `supabase/migrations/20260521000000_fix_profiles_rls_select.sql`

**Problem:** The RLS policy on `profiles` for SELECT was `USING (auth.uid() = id)`. This meant every query could only return the row belonging to the authenticated user. The leaderboard query in `Dashboard.tsx` requests top 5 profiles ordered by points, but Postgres silently filtered out all other users' rows, returning only 1 result.

**Fix:** Added a new migration that drops the restrictive policy and creates `"Authenticated users can read all profiles"` with `USING (true)` scoped to the `authenticated` role. Write operations (`INSERT`, `UPDATE`, `DELETE`) remain protected by `auth.uid() = id`.

**PR:** [#14](../../pull/14) `fix(rls): allow authenticated users to read all profiles for leaderboard`

---

## Bonus — FunctionsHttpError normalization

**File:** `src/pages/GeneratedPosts.tsx` line 91

`FunctionsHttpError` (thrown by `supabase.functions.invoke`) does not extend the native `Error` class. If it was passed directly to the `catch` block and accessed as `err.message`, the server-side error message was silently dropped. Added `throw new Error(error.message ?? String(error))` immediately after a failed `invoke` call to normalize it before the catch handler runs.

**PR:** [#13](../../pull/13)

---

## How I Tested

### Automated E2E — Playwright MCP (12/12 PASS)

A 12-step smoke test was executed against `http://localhost:8080` using the Playwright MCP browser automation tool. Each step was verified with a browser snapshot or screenshot.

| Step | Description | Result |
|---|---|---|
| 1 | Login as demo.a | PASS |
| 2 | Dashboard loads with points and leaderboard | PASS |
| 3 | Redeem points deducts from current user | PASS |
| 4 | Leaderboard shows 3 distinct users | PASS |
| 5 | Article cards show real titles from DB | PASS |
| 6 | Article selection persists after reload | PASS |
| 7 | Post generation via Edge Function creates a draft | PASS |
| 8 | Edited post text persists after page reload | PASS |
| 9 | Scheduled post preview shows article image | PASS |
| 10 | display_name preserved after onboarding save | PASS |
| 11 | Profile page shows email, preferences, and points | PASS |
| 12 | Logout clears session and redirects to /login | PASS |

### Manual verification

Each bug was reproduced manually before fixing to confirm the root cause. After each fix, the affected flow was verified in the browser before committing.

### Build and lint

```powershell
npm run lint   # 0 errors
npm run build  # 0 errors, 0 warnings
```

---

## Pull Requests (in merge order)

| PR | Branch | Description |
|---|---|---|
| [#2](../../pull/2) | `fix/5-onboarding-display-name` | Bug 5 — display_name preserved |
| [#5](../../pull/5) | `fix/1-article-titles` | Bug 1 — real article titles |
| [#7](../../pull/7) | `fix/2-redeem-points` | Bug 2 — points deducted from correct user |
| [#9](../../pull/9) | `fix/3-save-edit` | Bug 3 — post edits persisted to DB |
| [#11](../../pull/11) | `fix/4-scheduled-image` | Bug 4 — correct imageurl column |
| [#13](../../pull/13) | `fix/functions-http-error` | Bonus — FunctionsHttpError normalization |
| [#14](../../pull/14) | `fix/6-rls-profiles` | Bug 6 — leaderboard RLS policy |
| [#15](../../pull/15) | `chore/quality-pass` | Lint clean, build clean, Spanish inline comments |

---

## Security Checklist

- No `.env` files committed
- No production Supabase URL or `service_role` key in the codebase
- No real LinkedIn OAuth credentials
- No paid API keys
- No real user or customer data
- File `SOLUTIONS.md` (plural) is in `.gitignore` — only `SOLUTION.md` (singular) exists
