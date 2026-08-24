-- Server-side redemption tracking + cross-device duplicate-claim protection.
-- Applied to the alpha_recruitment project (ref rmpeicswaxucmvpflbyd) on
-- 2026-08-23 via MCP; kept here as the schema record. Idempotent.

-- 1. When staff hand out the item, the application row gets stamped.
alter table public.applications
  add column if not exists redeemed_at timestamptz;

-- 2. One claim per email across devices, case-insensitive. If this fails with
--    "could not create unique index", there are pre-existing duplicates; list
--    them with
--      select lower(email), count(*) from public.applications
--      group by 1 having count(*) > 1;
--    delete the extras, then re-run.
create unique index if not exists applications_email_unique
  on public.applications (lower(email));

-- 3. Redeem RPC. anon has insert-only RLS on applications, so the redeemed_at
--    update runs in a security-definer function instead of a table grant.
--    Inputs are validated by /api/redeem to the same rules as /api/apply, so
--    the fallback insert can't trip the table's CHECKs.
create or replace function public.redeem_application(p_email text, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.applications
     set redeemed_at = now()
   where lower(email) = lower(p_email)
     and redeemed_at is null;
  get diagnostics updated = row_count;
  if updated > 0 then
    return 'redeemed';
  end if;

  if exists (
    select 1 from public.applications where lower(email) = lower(p_email)
  ) then
    return 'already_redeemed';
  end if;

  -- The claim insert never made it (offline claim / outage) but the item is
  -- being handed out — record the application now, already redeemed.
  insert into public.applications (name, email, claimed_at, redeemed_at)
  values (p_name, p_email, now(), now());
  return 'recorded_without_claim';
end;
$$;

-- Supabase grants EXECUTE to public + authenticated by default; restrict to
-- anon, the only role the API uses. The security advisors still WARN that a
-- security-definer function is anon-callable — intentional: it's what keeps
-- the table itself insert-only for anon.
revoke execute on function public.redeem_application(text, text) from public;
revoke execute on function public.redeem_application(text, text) from authenticated;
grant execute on function public.redeem_application(text, text) to anon;
