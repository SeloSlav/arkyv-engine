import { useEffect, useState } from 'react';
import { isMarketingBrowser } from '@/lib/siteMode';

export default function useMarketingSite() {
  const [marketingSite, setMarketingSite] = useState(false);

  useEffect(() => {
    setMarketingSite(isMarketingBrowser());
  }, []);

  return marketingSite;
}
