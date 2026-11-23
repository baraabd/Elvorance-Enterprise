import type { CatalogDirectory, ScopeItem } from '@elvorance/contracts';
import { assert } from '@elvorance/service-kit';

export async function verifyCatalogPricing(
  directory: CatalogDirectory,
  authorization: string,
  content: { currency: string; items: ScopeItem[] },
) {
  const catalog = await directory.getCatalog(authorization);
  assert(
    catalog.configured,
    'CATALOG_REQUIRED',
    'Publish tenant service prices before preparing quotes',
    409,
  );
  assert(
    content.currency === catalog.currency,
    'CATALOG_CURRENCY',
    'Quote currency must match the published catalog',
  );
  let customPricing = false;
  for (const item of content.items) {
    const published = catalog.items.find((service) => service.id === item.serviceId);
    assert(
      published,
      'SERVICE_UNAVAILABLE',
      'Quote includes a service absent from the active tenant catalog',
      409,
    );
    if (published.unitPriceMinor === 0) customPricing = true;
    else
      assert(
        item.unitPriceMinor === published.unitPriceMinor,
        'CATALOG_PRICE',
        'Use the published unit price and apply any requested discount explicitly',
        409,
      );
  }
  return { catalogVersion: catalog.recordVersion, customPricing };
}
