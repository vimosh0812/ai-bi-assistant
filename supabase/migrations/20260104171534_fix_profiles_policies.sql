-- Fix infinite recursion in profiles policies
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_role_admin" ON public.profiles;
