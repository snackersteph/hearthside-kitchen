// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env['SUPABASE_URL'];
const publicKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
const adminKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
describe.skipIf(!url || !publicKey || !adminKey)('Account privacy and message delivery', () => {
  let admin: SupabaseClient;
  const clients: SupabaseClient[] = [];
  const ids: string[] = [];
  let messageId: string;
  function client(index: number) { const value = clients[index]; if (!value) throw new Error('Test account missing'); return value; }
  beforeAll(async () => {
    if (!url || !publicKey || !adminKey) throw new Error('Account test configuration missing');
    admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of ['Account test sender', 'Account test recipient', 'Account test outsider']) {
      const email = `account-test-${randomUUID()}@example.com`;
      const password = randomUUID() + 'Aa1!';
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
      if (error || !data.user) throw error ?? new Error('Test user not created');
      ids.push(data.user.id);
      const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      clients.push(client);
    }
  }, 30_000);
  afterAll(async () => { for (const id of ids) await admin.auth.admin.deleteUser(id); });
  it('creates the requested name profile and prevents reading another private profile', async () => {
    const own = await client(0).from('profiles').select('*').eq('id', ids[0]).single();
    expect(own.data.display_name).toBe('Account test sender');
    const other = await client(0).from('profiles').select('*').eq('id', ids[1]);
    expect(other.data).toEqual([]);
  });
  it('delivers a message and its notification only to the participant accounts', async () => {
    const sent = await client(0).from('user_messages').insert({ sender_id: ids[0], recipient_id: ids[1], body: 'Please review the lunch menu.' }).select().single();
    expect(sent.error).toBeNull(); messageId = sent.data.id;
    const received = await client(1).from('user_messages').select('*').eq('id', messageId).single();
    expect(received.data.body).toBe('Please review the lunch menu.');
    const notice = await client(1).from('user_notifications').select('*').eq('message_id', messageId).single();
    expect(notice.data.title).toBe('New message');
    expect(notice.data.user_id).toBe(ids[1]);
    const outsider = await client(2).from('user_messages').select('*').eq('id', messageId);
    expect(outsider.data).toEqual([]);
    const outsiderNotice = await client(2).from('user_notifications').select('*').eq('message_id', messageId);
    expect(outsiderNotice.data).toEqual([]);
  });
  it('prevents impersonating another sender or editing message contents', async () => {
    const spoof = await client(2).from('user_messages').insert({ sender_id: ids[0], recipient_id: ids[1], body: 'Impersonation attempt' });
    expect(spoof.error).not.toBeNull();
    const edit = await client(1).from('user_messages').update({ body: 'Changed contents' }).eq('id', messageId);
    expect(edit.error).not.toBeNull();
  });
  it('allows the recipient to mark their received message read', async () => {
    const readAt = '2026-11-10T20:11:00.000Z';
    const result = await client(1).from('user_messages').update({ read_at: readAt }).eq('id', messageId).select().single();
    expect(result.error).toBeNull();
    expect(new Date(result.data.read_at).toISOString()).toBe(readAt);
  });
});