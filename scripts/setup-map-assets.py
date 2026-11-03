"""Download the same fonts and sprites used by the source offline-map Docker image."""
from pathlib import Path
from io import BytesIO
from urllib.request import urlopen
from zipfile import ZipFile

target = Path(__file__).resolve().parents[1] / '.runtime' / 'map-assets'
url = 'https://codeload.github.com/protomaps/basemaps-assets/zip/refs/heads/main'
with urlopen(url, timeout=60) as response:
    archive = ZipFile(BytesIO(response.read()))
count = 0
for entry in archive.infolist():
    parts = Path(entry.filename).parts[1:]
    if not parts or parts[0] not in ('fonts', 'sprites') or entry.is_dir():
        continue
    destination = target.joinpath(*parts).resolve()
    if not destination.is_relative_to(target.resolve()):
        raise ValueError('Invalid archive path')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(archive.read(entry))
    count += 1
print(f'Installed {count} offline font/sprite assets in {target}')
