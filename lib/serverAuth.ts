// Server-side helpers for authenticating API requests.
//
// The client sends its Firebase ID token in the `Authorization: Bearer <token>`
// header (see lib/authFetch.ts). We verify it with the Firebase Auth REST API,
// so no service-account credentials are needed.
import { NextRequest, NextResponse } from 'next/server';
import { isUserAdmin } from './adminService';

const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

export interface AuthedUser {
  uid: string;
  email?: string;
}

function getBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Returns the verified user for the request, or null if the token is missing/invalid. */
export async function getRequestUser(request: NextRequest | Request): Promise<AuthedUser | null> {
  const idToken = getBearerToken(request);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;

  try {
    const res = await fetch(`${LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const account = data?.users?.[0];
    if (!account?.localId) return null;
    return { uid: account.localId, email: account.email };
  } catch (err) {
    console.error('[serverAuth] Token verification failed:', err);
    return null;
  }
}

type AuthResult =
  | { user: AuthedUser; error?: never }
  | { user?: never; error: NextResponse };

/** Requires a signed-in user. Usage: `const auth = await requireUser(req); if (auth.error) return auth.error;` */
export async function requireUser(request: NextRequest | Request): Promise<AuthResult> {
  const user = await getRequestUser(request);
  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

/** Requires a signed-in user whose UID is listed in the `admin` collection. */
export async function requireAdmin(request: NextRequest | Request): Promise<AuthResult> {
  const auth = await requireUser(request);
  if (auth.error) return auth;
  if (!(await isUserAdmin(auth.user.uid))) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  }
  return auth;
}
