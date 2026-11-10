import { createFileRoute, Link } from '@tanstack/react-router';
import { AccountAuth } from '@/components/account-auth';
import { useAccount } from '@/lib/account';
export const Route = createFileRoute('/auth')({
  head: () => ({ meta: [{ title: 'Log in · NutriSync' }, { name: 'description', content: 'Sign in to your NutriSync account.' }, { property: 'og:title', content: 'Log in · NutriSync' }, { property: 'og:description', content: 'Sign in to your NutriSync account.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: AuthPage,
});
function AuthPage() { const { user } = useAccount(); return <div className="mx-auto max-w-md py-8">{user ? <><h1 className="mb-4 text-2xl">You're signed in.</h1><Link to="/" className="text-primary underline">Back to Kitchen Pulse</Link></> : <AccountAuth />}</div>; }