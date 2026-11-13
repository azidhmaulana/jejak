# Analytics

- Public: navbar Analytics, popular cameras, city totals and daily camera-opening trend.
- Private: CMS Analytics. Both an admin/superadmin role and `analytics.view` are required by the API. Existing admin roles receive this permission once; later revocations are preserved.
- PostgreSQL `analytics_events` retains 90 days. No account IDs, raw IPs, email, route coordinates, search text or full referrer URLs are stored. Random browser and tab-session IDs are hashed before storage. Do Not Track disables collection.
- Sessions expire after 30 minutes without a tracked event. Unique visitors mean browsers, not identified people. Clearing browser storage creates a new visitor.
- Monitor opens exclude thumbnails and automatic previews. Playback starts and failures are separate counters. Watch time counts visible, advancing video in 30-second blocks; partial blocks and snapshots are excluded. These are telemetry estimates, not billing metrics.
- Registration counts come from server audit events. Route usage counts successful route calculations. Public responses never include visitor/session/device/referrer/registration details.
- Reports support rolling 1/7/30/90-day periods; daily/hourly buckets use UTC+7. No historical traffic is invented. Provider statistics, browser/OS breakdowns and custom date ranges are not included in this first version.
- Public telemetry is untrusted input: event schema, catalog camera IDs, request limits and short-window deduplication reduce accidental duplication/abuse, but do not guarantee bot-free traffic. No shared secret is shipped to browsers.
- Raw event storage and aggregate queries target the current single-instance deployment. Before high-volume rollout, add daily aggregate tables and load-test with expected traffic.

Validation: backend analytics tests cover role separation, permission revocation migration, payload rejection, deduplication and public response privacy. Browser tests cover separate public/CMS interfaces and monitor-only event collection.

Footer: `/api/analytics/presence` exposes only the number of distinct browser visitors active within 5 minutes, including guests. PostgreSQL events are queried with a 15-second shared cache; the visible client polls every 30 seconds. Multiple tabs of the same browser count once. DNT opt-outs are excluded. This is not an all-time visitor total. Public panel camera health comes from the current catalog/client health checks; unknown status is shown separately.

Public camera-opening trends use 3-hour WIB buckets (00:00, 03:00, etc.), filled with zero when no opens were recorded. The first/last buckets may cover partial intervals because the selected period is rolling. Most-opened rankings and trends use stored camera_open events, not sample values. Admin reports retain daily buckets.
