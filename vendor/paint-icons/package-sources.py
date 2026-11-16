"""Reproducibly distribute the preferred artwork sources, notices and recipes."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import sys

directory = Path(__file__).resolve().parent
root = directory.parents[1]
buffer = BytesIO()
with ZipFile(buffer, 'w', compression=ZIP_DEFLATED) as archive:
    for folder in [directory, directory.parent / 'tabler']:
        for source in sorted(folder.rglob('*')):
            if not source.is_file() or '__pycache__' in source.parts:
                continue
            name = str(source.relative_to(directory.parent))
            entry = ZipInfo(name, date_time=(2026, 11, 15, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, source.read_bytes())
target = root / 'public/licenses/classic-paint-artwork.zip'
if '--check' in sys.argv:
    if target.read_bytes() != buffer.getvalue():
        raise SystemExit('Artwork source archive is stale.')
else:
    target.write_bytes(buffer.getvalue())
print('Artwork source archive verified: current and archived sources, licenses, recipes and builders.')
