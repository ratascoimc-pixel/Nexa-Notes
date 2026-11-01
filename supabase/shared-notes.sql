-- Run once in a dedicated Supabase project's SQL editor. Email confirmation must stay enabled.
create table public.shared_notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(title) between 1 and 300), body text not null check(length(body)<=500000),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.note_members (
 note_id uuid references public.shared_notes(id) on delete cascade,
 email text not null check(email=lower(email)), role text not null check(role in ('viewer','editor')),
 primary key(note_id,email)
);
alter table public.shared_notes enable row level security;
alter table public.note_members enable row level security;
create function public.can_read_note(n uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from shared_notes where id=n and owner_id=auth.uid()) or exists(select 1 from note_members where note_id=n and email=lower(auth.jwt()->>'email'));
$$;
create policy note_read on public.shared_notes for select to authenticated using(public.can_read_note(id));
create policy note_create on public.shared_notes for insert to authenticated with check(owner_id=auth.uid());
create policy note_delete on public.shared_notes for delete to authenticated using(owner_id=auth.uid());
create policy member_read on public.note_members for select to authenticated using(public.can_read_note(note_id));
create policy member_add on public.note_members for insert to authenticated with check(exists(select 1 from shared_notes where id=note_id and owner_id=auth.uid()));
create policy member_remove on public.note_members for delete to authenticated using(exists(select 1 from shared_notes where id=note_id and owner_id=auth.uid()));
create function public.save_shared_note(note uuid, expected_revision integer, new_title text, new_body text)
returns public.shared_notes language plpgsql security definer set search_path=public as $$
declare saved shared_notes;
begin
 if auth.uid() is null or not exists(select 1 from shared_notes where id=note and (owner_id=auth.uid() or exists(select 1 from note_members where note_id=note and email=lower(auth.jwt()->>'email') and role='editor'))) then raise exception 'Editing is not permitted'; end if;
 update shared_notes set title=new_title,body=new_body,revision=revision+1,updated_at=now() where id=note and revision=expected_revision returning * into saved;
 if saved.id is null then raise exception 'This note changed. Copy your draft, reload the latest note, and try again.'; end if;
 return saved;
end; $$;
revoke all on function public.save_shared_note(uuid,integer,text,text) from public,anon;
grant execute on function public.save_shared_note(uuid,integer,text,text) to authenticated;
revoke all on public.shared_notes,public.note_members from anon,authenticated;
revoke all on function public.can_read_note(uuid) from public,anon;
grant execute on function public.can_read_note(uuid) to authenticated;
grant select,insert,delete on public.shared_notes,public.note_members to authenticated;
