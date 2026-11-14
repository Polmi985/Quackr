'use client';

// fetch() wrapper that attaches the current user's Firebase ID token,
// so API routes can verify who is calling them (see lib/serverAuth.ts).
import { auth } from './firebaseAuth';

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
