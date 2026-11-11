"""Inspect specification closure. This does not execute or certify product behavior."""
import collections
import json
import math
import re
from pathlib import Path

root = Path(__file__).resolve().parent
rows = json.loads((root / 'requirements.json').read_text())
map_names = ['MODULE_MAP.md', 'MODULE_MAP-CAD.md', 'MODULE_MAP-MEDIA.md']
maps = [root / name for name in map_names]
assert len(rows) == len({row['id'] for row in rows}) == len({row['verification'] for row in rows})
assert {row['need'] for row in rows} == {f'N-{index:03d}' for index in range(1, 8)}
required = ['id', 'need', 'phase', 'verificationPhase', 'statement', 'module',
            'verification', 'procedure', 'method', 'status']
for row in rows:
    assert all(row.get(field) is not None for field in required), row['id']
    assert row['verification'] == 'V-' + row['id']
    assert row['method'] in ['T', 'I', 'A', 'D']
    assert row['status'] in ['PASS', 'FAIL', 'UNTESTED']
    assert row['verificationPhase'] >= row['phase']
    assert row['procedure'].strip() and 'shall' in row['statement']
    for name in ['02-REQUIREMENTS.md', '06-TRACEABILITY.md']:
        assert row['id'] in (root / name).read_text(), (row['id'], name)
contracts = {}
for path in maps:
    pattern = r'^#{2,3} ([SCIVD]\d{2}) ([^\n]+)\n(.*?)(?=^#{2,3} |\Z)'
    for match in re.finditer(pattern, path.read_text(), re.M | re.S):
        key, title, body = match.groups()
        assert key not in contracts, key
        for label in ['Purpose:', 'IN:', 'OUT:', 'RAISES:', 'DEPS:']:
            assert label in body, (key, label)
        dep_line = re.search(r'DEPS:([^\n]*)', body).group(1)
        deps = re.findall(r'\b[SCIVD]\d{2}\b', dep_line)
        assert len(set(deps)) <= 3, (key, deps)
        contracts[key] = deps
for key, deps in contracts.items():
    for dependency in deps:
        assert dependency in contracts, (key, dependency)
visiting, seen = set(), set()


def visit(key):
    assert key not in visiting, ('cycle', key)
    if key in seen:
        return
    visiting.add(key)
    for dependency in contracts[key]:
        visit(dependency)
    visiting.remove(key)
    seen.add(key)


for key in contracts:
    visit(key)
for path in root.glob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if '://' not in target and not target.startswith('#'):
            assert (path.parent / target.split('#')[0]).exists(), (path.name, target)
combined_maps = '\n'.join(path.read_text() for path in maps)
owners = {row['module'] for row in rows}
for owner in owners:
    assert owner in combined_maps, owner
print(f'TRACE PASS: {len(rows)} unique requirements, {len(rows)} unique verification procedures, 7 needs; metadata and Markdown closure valid.')
print(f'MAP PASS: {len(contracts)} unique contracts; all required fields; known dependencies; maximum 3 collaborators; no cycles.')
print(f'LINK PASS: local document links resolve; all {len(owners)} conceptual design owners bound.')
counts = collections.Counter(row['status'] for row in rows)
print(f'REQUIREMENT STATUS: PASS {counts["PASS"]}; FAIL {counts["FAIL"]}; UNTESTED {counts["UNTESTED"]}. Status is recorded evidence; this audit does not execute product behavior.')
for width in [100, 120]:
    volume = width * 600 - (4 - math.pi) * 250 - 360 * math.pi - 2000
    print(f'ANALYTICAL ORACLE width={width}: {volume:.9f} mm3; not a kernel test.')
