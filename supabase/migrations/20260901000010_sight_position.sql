-- Where the sight rod sits on the riser, recorded per mark like the windage beside it.
alter table public.sight_mark add column if not exists position text;
