-- Create user profiles table with role-based access
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Create policies for profiles table
-- Users can view their own profile
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can view all profiles
create policy "profiles_select_admin"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Users can insert their own profile
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile (except role)
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id and 
    (old.role = new.role or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ))
  );

-- Only admins can update roles
create policy "profiles_update_role_admin"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Users can delete their own profile
create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- Create function to handle new user registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'user')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Create trigger to automatically create profile on user signup
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Create function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Create trigger to update updated_at on profile changes
create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();
