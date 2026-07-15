import { NextResponse } from 'next/server';
import { getCanonicalMarketingHostname, isMarketingSite } from '@/lib/siteMode';

export function middleware(request) {
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
  matcher: ['/auth', '/play', '/admin', '/profile'],
};
