// Only basemap display metadata is public. Jobs, queues and source diagnostics are administrative.
export function publicMapCatalog(state) {
  const fields = [
    'id',
    'name',
    'title',
    'file',
    'bounds',
    'minzoom',
    'maxzoom',
    'provider',
    'sourceDate',
    'mapType',
    'selectedVariant',
    'providerLabel',
    'attribution',
  ];
  return {
    activeId: state.activeId,
    activeByProvider: state.activeByProvider,
    regions: state.regions.map((region) => ({
      ...Object.fromEntries(
        fields.filter((key) => Object.hasOwn(region, key)).map((key) => [key, region[key]]),
      ),
      ...(region.variants
        ? {
            variants: region.variants.map(({ id, providerLabel, mapType }) => ({
              id,
              providerLabel,
              mapType,
            })),
          }
        : {}),
    })),
  };
}
