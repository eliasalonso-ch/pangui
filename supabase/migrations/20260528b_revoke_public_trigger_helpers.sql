-- Remove direct REST/RPC access to trigger-only/security-definer helpers.
-- Triggers can still execute these as their owner; this only blocks client calls.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.notify_users(uuid[], text, text, text, text) from public;
revoke execute on function public.trigger_notify_assignment() from public;
revoke execute on function public.trigger_notify_comment() from public;
revoke execute on function public.trigger_notify_completion() from public;
