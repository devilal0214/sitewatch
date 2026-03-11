import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default function RootPage() {
  // Middleware handles auth redirect; this is a fallback.
  redirect('/dashboard');
}
