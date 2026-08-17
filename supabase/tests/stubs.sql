-- What a plain Postgres lacks and Supabase supplies: the auth schema, the roles the policies name,
-- and auth.uid(). Enough to prove the migrations apply and the policies compile, which is the part
-- worth catching before a deploy. Behaviour is proven by the policy tests, against a real stack.
create role anon;
create role authenticated;
create schema if not exists auth;

create table auth.users (id uuid primary key);

-- The real one reads a JWT claim. This reads a session setting so a test can become somebody.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
	select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
