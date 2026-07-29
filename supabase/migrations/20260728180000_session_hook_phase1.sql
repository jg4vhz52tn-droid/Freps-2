-- W1 phase 1 (inert): real server-side single-device-login enforcement.
--
-- Today, checkDeviceSession() in kf-supabase.js just polls the DB from the
-- client every 30s and signs itself out on mismatch -- anyone who blocks
-- that poll (or copies the still-valid JWT to another client) stays logged
-- in indefinitely, because the Supabase session itself is never actually
-- invalidated server-side. RLS can only see auth.uid() and whatever claims
-- are baked into the JWT at mint time -- it has no way to see the client's
-- localStorage device token, so the only way to make this a real,
-- server-checked rule is to get the *current* active_session_token embedded
-- into the JWT itself, via a Postgres Custom Access Token (Auth) Hook.
--
-- This migration only adds the hook function + a helper -- it does NOT wire
-- either into any RLS policy/trigger yet, and enabling the hook itself is a
-- one-time manual step in the Supabase Dashboard (Authentication -> Hooks),
-- not something a migration can flip. Rolling out phase 2 (actually
-- enforcing the check in chapter-freigabe / course-publish / profile-update
-- policies) before every active session's JWT carries the new claim would
-- lock out everyone still holding a pre-hook token -- see the follow-up
-- migration + rollout notes for the exact sequencing.

-- Called by Supabase Auth on every token mint (once the hook is enabled in
-- the dashboard). event = { user_id, claims: {...}, ... }; must return the
-- (optionally modified) event.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  claims jsonb;
  token text;
begin
  select active_session_token into token from public.profiles where id = (event->>'user_id')::uuid;
  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{session_token}', to_jsonb(coalesce(token, '')));
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Per Supabase's documented hook setup: only the auth service may call this,
-- and it must be able to read profiles regardless of the caller's own RLS
-- (there is no "caller" yet at token-mint time) -- security definer already
-- covers the table read since the function owner bypasses RLS, this grant
-- is purely about who may invoke the function at all.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Helper for phase 2: true only if THIS request's JWT still carries the
-- session token currently on file for the user -- i.e. no newer login
-- (elsewhere) has replaced it since this token was minted. Not used by any
-- policy yet.
create or replace function public.session_token_valid()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select active_session_token::text from public.profiles where id = auth.uid())
      = nullif(auth.jwt() ->> 'session_token', ''),
    false
  );
$$;
