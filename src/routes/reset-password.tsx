import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export const Route = createFileRoute('/reset-password')({
  head: () => ({ meta: [{ title: 'Reset password · NutriSync' }, { name: 'description', content: 'Set a new password for your NutriSync account.' }, { property: 'og:title', content: 'Reset password · NutriSync' }, { property: 'og:description', content: 'Set a new password for your NutriSync account.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: ResetPassword,
});
function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const previous = sessionStorage.getItem('nutrisync-password-recovery') === 'true';
      if (data.user && (hash.get('type') === 'recovery' || previous)) { sessionStorage.setItem('nutrisync-password-recovery', 'true'); setRecovery(true); }
    };
    void check();
    const timer = window.setInterval(() => { if (sessionStorage.getItem('nutrisync-password-recovery') === 'true') setRecovery(true); }, 500);
    return () => window.clearInterval(timer);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!recovery) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message); else { sessionStorage.removeItem('nutrisync-password-recovery'); setDone(true); }
    setBusy(false);
  }
  return <div className="mx-auto max-w-md space-y-5 py-8"><h1 className="text-2xl font-semibold">Reset password</h1>{done ? <><p role="status" className="text-success">Your password has been updated.</p><Link to="/">Back to Kitchen Pulse</Link></> : recovery ? <form onSubmit={submit} className="space-y-4"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />{error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button></form> : <><p className="text-muted-foreground">Open your password reset email to set a new password.</p><Link to="/auth" className="text-primary underline">Request a new link</Link></>}</div>;
}