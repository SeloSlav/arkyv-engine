import { NextResponse } from 'next/server';
import { getCanonicalMarketingHostname, isMarketingSite } from '@/lib/siteMode';

export async function middleware(request) {
  if (request.nextUrl.pathname.startsWith('/api/arkyv/')) {
    const token = request.cookies.get('arkyv_spacetime_token')?.value;
    if (!token) return NextResponse.json({ error: 'A saved-world identity is required.' }, { status: 401 });
    const uri = (process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const database = encodeURIComponent(process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME || 'arkyv-engine');
    const route = request.nextUrl.pathname.split('/').pop() || 'provider';
    try {
      const authorization = await fetch(`${uri}/v1/database/${database}/call/authorize_provider_request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${decodeURIComponent(token)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([route]),
      });
      if (!authorization.ok) {
        const message = await authorization.text();
        return NextResponse.json({ error: 'Provider request denied.', message }, { status: authorization.status === 401 ? 401 : 429 });
      }
    } catch {
      return NextResponse.json({ error: 'Unable to verify the saved-world identity.' }, { status: 503 });
    }
    return NextResponse.next();
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = forwardedHost?.split(',')[0]
    || request.headers.get('host')
    || request.nextUrl.hostname;

  if (!isMarketingSite(requestHost)) return NextResponse.next();

  const setupUrl = request.nextUrl.clone();
  const canonicalHostname = getCanonicalMarketingHostname(requestHost);
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0];
  if (canonicalHostname) {
    setupUrl.hostname = canonicalHostname;
    setupUrl.port = '';
    if (forwardedProtocol === 'http' || forwardedProtocol === 'https') {
      setupUrl.protocol = `${forwardedProtocol}:`;
    }
  }
  setupUrl.pathname = '/setup';
  setupUrl.search = '';
  setupUrl.searchParams.set('from', 'hosted-site');
  return NextResponse.redirect(setupUrl);
}

export const config = {
  matcher: ['/auth', '/play', '/admin', '/profile', '/api/arkyv/:path*'],
};
