-- [ES] Bug #6: la política original restringía SELECT a auth.uid() = id, impidiendo que el leaderboard
-- leyera filas de otros usuarios; se reemplaza por una política permisiva para el rol authenticated.
-- Allow all authenticated users to read profiles (required for leaderboard).
-- The previous policy restricted SELECT to auth.uid() = id, which blocked
-- the leaderboard query from returning other users' rows.
DROP POLICY IF EXISTS "Challenge users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Authenticated users can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
