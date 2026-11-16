# Wind grid

JEJAK reads NOAA GFS 10 m U/V wind from the public NOAA AWS GRIB2 archive.
Only the two wind messages are downloaded using validated byte ranges.
Resolution is 1 degree (360 x 181 points). Interpolation is bilinear on vector
components, with longitude wrapping. On-screen particle speed is illustrative.

The legend shows valid time in UTC. Model runs are every six hours; the API
allows publication time and falls back to earlier runs. Earth Nullschool also
uses GFS, but values can differ with model run, resolution and valid time.
JEJAK does not depend on Earth Nullschool endpoints.

## Deployment

Install Python 3.12+ alongside Node, then create an isolated environment:

Windows:
```powershell
python -m venv .runtime/wind-python
.runtime/wind-python/Scripts/python.exe -m pip install -r scripts/wind-requirements.txt
```

Linux:
```sh
python3 -m venv .runtime/wind-python
.runtime/wind-python/bin/python -m pip install -r scripts/wind-requirements.txt
```

Alternatively set JEJAK_WIND_PYTHON to an absolute Python executable with the
requirements installed. Include scripts/decode-wind.py in deployment. Install
dependencies during deployment, never on incoming requests.

GET /api/weather/wind?hour=0 accepts offsets in 3-hour steps from -72 to 120.
Grids cache for 20 minutes; identical concurrent requests coalesce. At most two
distinct grid jobs run concurrently. Upstream URL, sizes and timeouts are bounded.
Failure returns 503 without synthetic wind data.

Tests: node --test test/wind.test.mjs and npx playwright test test/browser/wind.spec.ts.
