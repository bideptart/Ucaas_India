import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
// import { getEnv } from '@/lib/utils';
import { getMainSiteInfo } from '@/services/api';
import ServerMaintenance from '@/components/custom/server-maintenance';
import { getEnv } from '@/lib/utils';
import FullPageLoader from '@/components/custom/full-page-loader';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const NO_ORGANIZATION_PATH = '/no-organization';

const getFirstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const getAbsoluteAssetUrl = (path: unknown) => {
  const assetPath = getFirstNonEmptyString(path);
  if (!assetPath) return '';
  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  const baseUrl = (getEnv() as { VITE_API_BASE_URL?: string }).VITE_API_BASE_URL || '';
  return `${baseUrl.replace(/\/$/, '')}/${assetPath.replace(/^\//, '')}`;
};

const setMetaContent = (attribute: 'name' | 'property', key: string, content: string) => {
  if (!content) return;

  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.content = content;
};

export interface MainSiteInfo {
  [key: string]: unknown;
}

interface OrganizationContextType {
  mainSiteInfo: MainSiteInfo | null;
  isLoading: boolean;
  error: Error | null;
}

export const OrganizationContext = createContext<OrganizationContextType>({
  mainSiteInfo: null,
  isLoading: true,
  error: null,
});

/**
 * Organisation branding is looked up by the domain the app is served from, so
 * normally the current origin is the right answer.
 *
 * A development or preview host is not registered with the backend, which
 * answers "Website settings not found" and leaves the app with nothing to
 * render. Those hosts fall back to QA — which is what localhost has always
 * done, now extended to the other hosts that share the problem.
 *
 * `VITE_ORG_DOMAIN` overrides both, for a deployment that should follow one
 * specific organisation no matter where it is hosted.
 */
const FALLBACK_ORG_DOMAIN = 'https://qa.mycountrymobile.com';

const isUnregisteredHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname.endsWith('.local') ||
  hostname.endsWith('.vercel.app');

const getDomain = () => {
  const configured = getFirstNonEmptyString(
    (getEnv() as { VITE_ORG_DOMAIN?: string }).VITE_ORG_DOMAIN,
  );
  if (configured) return configured.replace(/\/+$/, '');

  return isUnregisteredHost(window.location.hostname)
    ? FALLBACK_ORG_DOMAIN
    : window.location.origin;
};

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const [mainSiteInfo, setMainSiteInfo] = useState<MainSiteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isNoOrgPage, setIsNoOrgPage] = useState(false);

  const stripePublishableKey =
    typeof mainSiteInfo?.stripe_publish_key === 'string'
      ? mainSiteInfo.stripe_publish_key.trim()
      : '';
  const stripePromise = useMemo(
    () => (stripePublishableKey ? loadStripe(stripePublishableKey) : null),
    [stripePublishableKey],
  );
  const appearance = { theme: 'stripe', hidePostalCode: true };

  const options: any = {
    currency: 'usd',
    appearance,
    fonts: [
      {
        cssSrc: 'https://fonts.googleapis.com/css?family=Montserrat:300,300i,400,500,600',
      },
    ],
  };

  const fetchMainSiteInfo = useCallback(async () => {
    const domain = getDomain();
    try {
      setIsLoading(true);
      setError(null);
      const res = await getMainSiteInfo({ domain }, { hideToastOnError: true });
      const result = res?.data?.data?.result ?? res?.data?.result ?? res?.data ?? null;
      setMainSiteInfo(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load organization'));
      // window.location.replace(NO_ORGANIZATION_PATH);
      return;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === NO_ORGANIZATION_PATH) {
      setIsNoOrgPage(true);
      setIsLoading(false);
      return;
    }
    // Clear title so it doesn't show until org data (fav_title) arrives
    document.title = '';
    fetchMainSiteInfo();
  }, [fetchMainSiteInfo]);
  // Apply mainSiteInfo colors to CSS variables: --primary, --color-ucass-primary-200, --color-ucass-active
  useEffect(() => {
    if (!mainSiteInfo || typeof document === 'undefined') return;
    const root = document.documentElement;
    const primary = mainSiteInfo.primary_color;
    const secondary = mainSiteInfo.secondary_color;
    const activeSidebar = mainSiteInfo.active_sidebar_color;
    const activeSidebarbg = mainSiteInfo.active_sidebar_bg_color;
    const loginBgColor = mainSiteInfo.login_page_bg_color;
    if (typeof primary === 'string' && primary) {
      root.style.setProperty('--primary', primary);
    }
    if (typeof secondary === 'string' && secondary) {
      root.style.setProperty('--color-ucass-primary-200', secondary);
    }
    if (typeof activeSidebar === 'string' && activeSidebar) {
      root.style.setProperty('--color-ucass-active', activeSidebar);
    }
    if (typeof activeSidebarbg === 'string' && activeSidebarbg) {
      root.style.setProperty('--color-ucass-active-bg', activeSidebarbg);
    }
    if (typeof loginBgColor === 'string' && loginBgColor) {
      root.style.setProperty('--color-ucass-login-bg', loginBgColor);
    }
  }, [mainSiteInfo]);

  // Apply organization branding to the document and social-sharing metadata.
  useEffect(() => {
    if (!mainSiteInfo || typeof document === 'undefined') return;
    const organizationName = getFirstNonEmptyString(
      mainSiteInfo.source_name,
      mainSiteInfo.organization_name,
      mainSiteInfo.organisation_name,
      mainSiteInfo.company_name,
      mainSiteInfo.fav_title,
    );
    const title = getFirstNonEmptyString(mainSiteInfo.fav_title, organizationName);
    const description = getFirstNonEmptyString(
      mainSiteInfo.meta_description,
      mainSiteInfo.description,
      organizationName,
      title,
    );
    const shareImageUrl = getAbsoluteAssetUrl(
      mainSiteInfo.large_logo || mainSiteInfo.small_logo || mainSiteInfo.fav_icon,
    );
    const favIconPath = mainSiteInfo.fav_icon;
    const pageUrl = window.location.href;

    document.title = title;
    setMetaContent('name', 'description', description);
    setMetaContent('property', 'og:type', 'website');
    setMetaContent('property', 'og:title', organizationName || title);
    setMetaContent('property', 'og:site_name', organizationName || title);
    setMetaContent('property', 'og:description', description);
    setMetaContent('property', 'og:url', pageUrl);
    setMetaContent('name', 'twitter:card', shareImageUrl ? 'summary_large_image' : 'summary');
    setMetaContent('name', 'twitter:title', organizationName || title);
    setMetaContent('name', 'twitter:description', description);

    if (shareImageUrl) {
      setMetaContent('property', 'og:image', shareImageUrl);
      setMetaContent('property', 'og:image:secure_url', shareImageUrl);
      setMetaContent('property', 'og:image:alt', organizationName || title);
      setMetaContent('name', 'twitter:image', shareImageUrl);
      setMetaContent('name', 'twitter:image:alt', organizationName || title);
    }

    if (typeof favIconPath === 'string' && favIconPath) {
      const trimmedPath = favIconPath.trim();
      const iconUrl = getAbsoluteAssetUrl(trimmedPath);
      const iconType = /\.svg($|\?)/i.test(trimmedPath)
        ? 'image/svg+xml'
        : /\.png($|\?)/i.test(trimmedPath)
          ? 'image/png'
          : /\.jpe?g($|\?)/i.test(trimmedPath)
            ? 'image/jpeg'
            : 'image/x-icon';
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = iconUrl;
      link.type = iconType;
    }
  }, [mainSiteInfo]);

  const value: OrganizationContextType = {
    mainSiteInfo,
    isLoading,
    error,
  };

  /* Stripe only matters to the billing screens, and <Elements> throws when it
     is handed no key. Rendering without the provider keeps that failure on the
     screens that actually use Stripe.

     This used to be a `!stripePublishableKey → <FullPageLoader />` guard
     placed above the checks below, which made a missing key indistinguishable
     from a page that is still loading: whenever the organisation lookup failed
     — an unregistered domain, an unreachable API — there was never going
     to be a key, so the app sat on that spinner forever and the error branch
     underneath was unreachable. */
  const withStripe = (content: ReactNode) =>
    stripePromise ? (
      <Elements stripe={stripePromise} options={options}>
        {content}
      </Elements>
    ) : (
      content
    );

  if (isNoOrgPage) {
    return (
      <OrganizationContext.Provider value={{ ...value, isLoading: false }}>
        {withStripe(children)}
      </OrganizationContext.Provider>
    );
  }

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (error) {
    return <ServerMaintenance onRefresh={fetchMainSiteInfo} />;
  }

  return (
    <OrganizationContext.Provider value={value}>
      {withStripe(children)}
    </OrganizationContext.Provider>
  );
};
