import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import '@lovable.dev/cloud-auth-js/styles.css';

export function AccountAuth() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice('Check your email for a password reset link.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account before signing in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete sign-in.'); }
    finally { setBusy(false); }
  }
  async function social(provider: 'google' | 'lovable') {
    setBusy(true); setError('');
    try { const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin }); if (result.error) setError(result.error.message); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <h2 className="text-xl font-semibold">{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h2>
    <form onSubmit={submit} className="space-y-4">
      {mode === 'signup' && <div className="space-y-2"><Label htmlFor="account-name">Name</Label><Input id="account-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>}
      <div className="space-y-2"><Label htmlFor="account-email">Email</Label><Input id="account-email" type="email" required maxLength={255} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
      {mode !== 'forgot' && <div className="space-y-2"><Label htmlFor="account-password">Password</Label><Input id="account-password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>}
      <Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'}</Button>
    </form>
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {mode !== 'forgot' && <div className="space-y-2">
      <Button variant="outline" className="google-auth-control w-full" disabled={busy} onClick={() => social('google')}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>Continue with Google</Button>
      <Button className="lovable-auth-button w-full" disabled={busy} onClick={() => social('lovable')}>Continue with Lovable</Button>
    </div>}
    <div className="flex flex-wrap justify-between gap-2"><Button variant="link" size="sm" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setNotice(''); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Back to log in'}</Button>{mode === 'login' && <Button variant="link" size="sm" onClick={() => setMode('forgot')}>Forgot password?</Button>}</div>
  </div>;
}