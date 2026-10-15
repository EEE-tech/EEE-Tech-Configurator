/* EEE Tech Configurator — site settings. Edit these values, not the component. */
const CLOUD_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const FUNCTION_URL = CLOUD_URL ? `${CLOUD_URL}/functions/v1/eee-configurator` : undefined;

export const CONFIGURATOR = {
  /** Live catalog, refreshed by the sync job (falls back to the snapshot below if the function is unreachable) */
  catalogUrl: FUNCTION_URL ? `${FUNCTION_URL}/catalog` : "/configurator/catalog.json",
  fallbackCatalogUrl: "/configurator/catalog.json",
  /** Where product requests are sent; without it the visitor's e-mail app opens */
  requestEndpoint: FUNCTION_URL ? `${FUNCTION_URL}/request` : undefined,
  /** Product pages live on the Shopify store: relative links in the catalog are prefixed with this */
  productBaseUrl: "https://YOUR-SHOP-DOMAIN",
  contactEmail: "sales@eee.tech",
  tolerance: 5,           // approximate match, ± %
  breakingRule: "min" as const, // product breaking capacity >= entered value
  lossRule: "max" as const,     // product power loss <= entered value
  accentColor: undefined as string | undefined, // e.g. "#1d5fa8"; default follows --eee-accent
};
