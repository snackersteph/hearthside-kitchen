import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, UserRound, MessageSquare, LogOut, Upload, Send, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount, useAccountData } from '@/lib/account';
import { supabase } from '@/integrations/supabase/client';
import { AccountAuth } from '@/components/account-auth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function AccountMenu() {
  const { user, ready } = useAccount();
  const account = useAccountData();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const data = account.data;
  const unread = data?.notifications.filter(n => !n.read_at).length ?? 0;
  function show(section: string) { setTab(section); setName(data?.profile?.display_name ?? ''); setFile(null); setOpen(true); }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); await queryClient.invalidateQueries({ queryKey: ['account'] }); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save changes.'); }
    finally { setBusy(false); }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); if (!user) return;
    await run(async () => {
      let avatar_path = data?.profile?.avatar_path ?? null;
      if (file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP photo up to 2 MB.');
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from('user-avatars').upload(path, file);
        if (error) throw error;
        avatar_path = path;
      }
      const { error } = await supabase.from('profiles').update({ display_name: name.trim(), avatar_path }).eq('id', user.id);
      if (error) throw error;
      setFile(null); toast.success('Profile updated.');
    });
  }
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!user || !recipient || !body.trim()) return;
    await run(async () => {
      const { error } = await supabase.from('user_messages').insert({ sender_id: user.id, recipient_id: recipient, body: body.trim() });
      if (error) throw error;
      setBody(''); toast.success('Message sent.');
    });
  }
  async function markRead(id: string, kind: 'message' | 'notification') {
    await run(async () => {
      const { error } = await supabase.from(kind === 'message' ? 'user_messages' : 'user_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    });
  }
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) { toast.error(error.message); return; }
    setOpen(false);
  }
  const userName = (id: string) => data?.directory.find(p => p.id === id)?.display_name ?? 'Team member';
  return <>
    <div className="flex items-center gap-2">
      {user && <><Button variant="ghost" size="icon" aria-label="Messages" title="Messages" onClick={() => show('messages')}><MessageSquare className="h-5 w-5" /></Button><Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} title="Notifications" onClick={() => show('notifications')}><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unread}</span>}</Button></>}
      <Button variant="outline" size="icon" disabled={!ready} aria-label={user ? 'Your account' : 'Log in'} title={user ? 'Your account' : 'Log in'} className="overflow-hidden rounded-full" onClick={() => show('profile')}>{data?.avatarUrl ? <img src={data.avatarUrl} alt="Your avatar" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{user ? 'Your account' : 'NutriSync account'}</DialogTitle><DialogDescription className="break-all">{user ? user.email : 'Welcome to NutriSync'}</DialogDescription></DialogHeader>
      {!user ? <AccountAuth /> : <>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="messages">Messages</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger></TabsList>
          {account.isPending && <p className="py-8 text-center text-muted-foreground">Loading your account…</p>}
          {account.error && <div role="alert" className="py-4 text-sm text-destructive">{account.error.message}<Button variant="link" onClick={() => account.refetch()}>Try again</Button></div>}
          <TabsContent value="profile"><form onSubmit={saveProfile} className="space-y-5 py-4">
            <div className="flex items-center gap-4">{data?.avatarUrl ? <img src={data.avatarUrl} alt="Your profile photo" className="h-20 w-20 shrink-0 rounded-full object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound className="h-8 w-8 text-muted-foreground" /></div>}<div className="min-w-0"><Label htmlFor="avatar-file" className="mb-2 flex items-center gap-2"><Upload className="h-4 w-4" />Profile photo</Label><Input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /><p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP · up to 2 MB</p></div></div>
            <div className="space-y-2"><Label htmlFor="profile-name">Name</Label><Input id="profile-name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></div>
            <Button disabled={busy || !data}>{busy ? 'Saving…' : 'Save profile'}</Button>
          </form></TabsContent>
          <TabsContent value="messages" className="space-y-5 py-4">
            <form onSubmit={send} className="space-y-3"><Label htmlFor="message-recipient">To</Label><Select value={recipient} onValueChange={setRecipient}><SelectTrigger id="message-recipient"><SelectValue placeholder="Choose a team member" /></SelectTrigger><SelectContent>{data?.directory.filter(p => p.id !== user.id).map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}</SelectContent></Select><Label htmlFor="message-body">Message</Label><Textarea id="message-body" value={body} onChange={e => setBody(e.target.value)} maxLength={4000} required className="min-h-24" /><Button disabled={busy || !recipient || !body.trim()}><Send className="h-4 w-4" />Send message</Button></form>
            <h3 className="border-t pt-4 text-base font-semibold">Your messages</h3>
            {data?.messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            <ul className="divide-y">{data?.messages.map(m => <li key={m.id} className="space-y-2 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{m.sender_id === user.id ? `To ${userName(m.recipient_id)}` : `From ${userName(m.sender_id)}`}</span><time className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</time></div><p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>{m.recipient_id === user.id && !m.read_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => markRead(m.id, 'message')}><Check className="h-3 w-3" />Mark read</Button>}{m.read_at && <span className="text-xs text-muted-foreground">Read</span>}</li>)}</ul>
          </TabsContent>
          <TabsContent value="notifications" className="py-4">{data?.notifications.length === 0 && <p className="text-sm text-muted-foreground">You're all caught up.</p>}<ul className="divide-y">{data?.notifications.map(n => <li key={n.id} className="space-y-2 py-4"><div className="flex items-center gap-2">{!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}<h3 className="text-sm font-semibold">{n.title}</h3></div><p className="text-sm text-muted-foreground">{n.body}</p><time className="block text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</time>{n.message_id && <Button size="sm" variant="link" onClick={() => setTab('messages')}>View message</Button>}{!n.read_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => markRead(n.id, 'notification')}>Mark read</Button>}</li>)}</ul></TabsContent>
        </Tabs>
        <div className="border-t pt-3"><Button variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" />Log out</Button></div>
      </>}
    </DialogContent></Dialog>
  </>;
}