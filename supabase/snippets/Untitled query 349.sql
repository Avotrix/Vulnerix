create or replace function public.whoami()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;