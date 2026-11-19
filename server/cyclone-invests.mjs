import { fresh } from './cyclone-providers.mjs';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function parseInvestAdvisory(text, product, now = Date.now()) {
  if (!['abioweb', 'abpwweb'].includes(product) || !text.includes('JOINT TYPHOON WRNCEN'))
    throw new Error('Invalid invest advisory');
  const normalized = text.replace(/\s+/g, ' ');
  const stamp = normalized.match(/(\d{2})(\d{2})(\d{2})Z-\d{6}Z([A-Z]{3})(\d{4})/);
  if (!stamp || !MONTHS.includes(stamp[4]) || +stamp[2] > 23 || +stamp[3] > 59)
    throw new Error('Invalid advisory date');
  const endMonth = MONTHS.indexOf(stamp[4]),
    year = +stamp[5];
  const candidates = [-1, 0]
    .map((offset) => Date.UTC(year, endMonth + offset, +stamp[1], +stamp[2], +stamp[3]))
    .filter((t) => new Date(t).getUTCDate() === +stamp[1] && fresh(t, now));
  if (!candidates.length) throw new Error('Stale invest advisory');
  const time = Math.max(...candidates),
    items = [];
  for (const block of normalized.split(/(?=\(\d+\))/)) {
    const designation = block.match(/\(INVEST (9\d[SWPABC])\)/)?.[1];
    if (
      !designation ||
      /IS NOW THE SUBJECT OF A TROPICAL CYCLONE WARNING|UPGRADED TO (?:A )?TROPICAL/i.test(block)
    )
      continue;
    const position = block
      .match(
        /(?:IS NOW LOCATED NEAR|IS LOCATED NEAR|LOCATED NEAR)\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/g,
      )
      ?.at(-1);
    const p = position?.match(/(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/);
    // A previous position alone is not a current observation.
    if (
      !p ||
      (!/IS NOW LOCATED NEAR|IS LOCATED NEAR/.test(block) && /PREVIOUSLY LOCATED/.test(block))
    )
      continue;
    const lat = +p[1] * (p[2] === 'S' ? -1 : 1),
      lng = +p[3] * (p[4] === 'W' ? -1 : 1);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Invalid invest position');
    const potential =
      block.match(/POTENTIAL FOR (?:THE )?DEVELOPMENT[^.]*?\b(LOW|MEDIUM|HIGH)\b/)?.[1] ?? null;
    if (!potential) continue;
    const wind = block.match(
      /MAXIMUM SUSTAINED SURFACE WINDS ARE ESTIMATED AT (\d+) TO (\d+) KNOTS/,
    );
    const windRangeKnots =
      wind && +wind[1] <= +wind[2] && +wind[2] <= 250 ? [+wind[1], +wind[2]] : null;
    items.push({
      id: 'invest-' + designation.toLowerCase() + '-' + new Date(time).getUTCFullYear(),
      name: designation,
      designation,
      kind: 'invest',
      potential,
      lat,
      lng,
      time,
      windKnots: null,
      windRangeKnots,
      gustKnots: null,
      direction: null,
      speedKnots: null,
      agency: 'JTWC',
      windPeriodMinutes: 1,
      source: 'https://www.metoc.navy.mil/jtwc/products/' + product + '.txt',
    });
  }
  return { items, feedTime: time };
}
