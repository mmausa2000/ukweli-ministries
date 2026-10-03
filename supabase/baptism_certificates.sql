-- Baptism certificate requests. Run once in the Supabase SQL editor.
--
-- Anyone can request a certificate from /baptism-certificate; an admin approves
-- it from /admin, after which the requester's private link prints it. Rows and
-- passport photos hold personal details, so unlike gallery_items they are not
-- readable with the anon key: RLS is on with no policies (only the service
-- role used by the API functions can reach them) and the photo bucket is private.

create table if not exists public.baptism_certificates (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'approved')),
  access_key    text not null,               -- secret in the requester's link
  full_name     text not null,
  birth_date    date,
  baptism_date  date not null,
  place         text not null,
  officiant     text not null,
  contact       text not null default '',    -- email or phone, for the admins only
  photo_path    text not null,               -- object path in the "certificates" bucket
  cert_no       text,                        -- assigned on approval
  approved_at   timestamptz
);

alter table public.baptism_certificates enable row level security;

-- The browser crops the photo to passport size and uploads a small JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
