const MARKETING_HOSTNAMES = new Set(['arkyv.org', 'www.arkyv.org']);

function configuredSiteMode() {
  return (process.env.NEXT_PUBLIC_ARKYV_SITE_MODE || '').trim().toLowerCase();
}

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '').split(':')[0];
}

export function getCanonicalMarketingHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return MARKETING_HOSTNAMES.has(normalized) ? normalized : null;
}

export function isMarketingSite(hostname) {
  if (getCanonicalMarketingHostname(hostname)) return true;
  const mode = configuredSiteMode();
  if (mode === 'marketing') return true;
  return false;
}

export function isMarketingBrowser() {
  return typeof window !== 'undefined' && isMarketingSite(window.location.hostname);
}
