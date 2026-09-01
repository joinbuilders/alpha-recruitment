-- Fisher Fall Frenzy (2026-09-01): the claim flow writes to public.interest —
-- the involvement-fair table, renamed from "applications" after that event
-- (today's public.applications belongs to the main website's membership form).
-- The anon insert policy was lost in that reshuffle; restore it so
-- POST /api/apply works. anon's table grant is already insert-only and
-- redeem_application() already targets interest, so this is the only gap.
-- Applied to the builders project (ref rmpeicswaxucmvpflbyd) via MCP on
-- 2026-09-01; kept here as the schema record. Idempotent.

drop policy if exists "allow interest inserts" on public.interest;
create policy "allow interest inserts"
  on public.interest
  for insert
  to anon
  with check (true);
