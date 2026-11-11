import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const AccountContext = createContext<{ user: User | null; ready: boolean }>({ user: null, ready: false });
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') sessionStorage.setItem('nutrisync-password-recovery', 'true');
      if (event === 'SIGNED_OUT') { setUser(null); queryClient.removeQueries({ queryKey: ['account'] }); }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void supabase.auth.getUser().then(({ data }) => { if (active) setUser(data.user); });
        void queryClient.invalidateQueries({ queryKey: ['account'] });
      }
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) void router.invalidate();
    });
    void supabase.auth.getUser().then(({ data }) => { if (active) { setUser(data.user); setReady(true); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [queryClient, router]);
  return <AccountContext.Provider value={{ user, ready }}>{children}</AccountContext.Provider>;
}
export const useAccount = () => useContext(AccountContext);
export function useAccountData(subscribe = true) {
  const { user } = useAccount();
  const queryClient = useQueryClient();
  const result = useQuery({
    queryKey: ['account', user?.id], enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error('Please sign in.');
      const [profile, directory, messages, notifications] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.rpc('account_directory'),
        supabase.from('user_messages').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('user_notifications').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      for (const response of [profile, directory, messages, notifications]) if (response.error) throw response.error;
      let avatarUrl: string | undefined;
      if (profile.data?.avatar_path) {
        const signed = await supabase.storage.from('user-avatars').createSignedUrl(profile.data.avatar_path, 3600);
        avatarUrl = signed.data?.signedUrl;
      }
      return { profile: profile.data, directory: directory.data ?? [], messages: messages.data ?? [], notifications: notifications.data ?? [], avatarUrl };
    }, staleTime: 30_000,
  });
  useEffect(() => {
    if (!user || !subscribe) return;
    const channel = supabase.channel(`account-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_messages' }, () => { void queryClient.invalidateQueries({ queryKey: ['account', user.id] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` }, () => { void queryClient.invalidateQueries({ queryKey: ['account', user.id] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, queryClient, subscribe]);
  return result;
}