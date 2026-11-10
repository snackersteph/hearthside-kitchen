REVOKE ALL ON public.profiles, public.user_messages, public.user_notifications FROM anon, authenticated;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_path) ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.user_messages TO authenticated;
GRANT UPDATE (read_at) ON public.user_messages TO authenticated;
GRANT SELECT ON public.user_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.user_notifications TO authenticated;