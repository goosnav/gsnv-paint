import { test } from 'node:test'; import assert from 'node:assert/strict';
import { defaultSettings, readSettings, mergeSettings, PRESETS, SLIDERS } from './develop-settings.ts';

test('P-SETTINGS defaults validate, round-trip through JSON and clamp merges into range', () => {
  const s = defaultSettings(); assert.deepEqual(readSettings(JSON.parse(JSON.stringify(s))), s);
  assert.equal(s.exposure, 0); assert.equal(s.sharpenAmount, 40); assert.deepEqual(s.crop, { x: 0, y: 0, width: 1, height: 1 });
  const merged = mergeSettings(s, { exposure: 9, contrast: -500, profile: 'mono' }); assert.equal(merged.exposure, 5); assert.equal(merged.contrast, -100); assert.equal(merged.profile, 'mono');
  assert.equal(s.exposure, 0, 'merge does not mutate');
  assert.ok(Object.keys(PRESETS).length >= 8); assert.ok(Object.values(SLIDERS).every(r => r.min <= r.fallback && r.fallback <= r.max));
});

test('P-SETTINGS rejects unknown fields, bad types and impossible geometry', () => {
  const bad = (patch: Record<string, unknown>) => assert.throws(() => readSettings({ ...defaultSettings(), ...patch }), { name: 'DevelopSettingsError' });
  bad({ extra: 1 }); bad({ exposure: '1' }); bad({ exposure: 6 }); bad({ profile: 'sepia' }); bad({ hue: [0] }); bad({ sat: new Array(8).fill(101) });
  bad({ crop: { x: 0.5, y: 0, width: 0.6, height: 1 } }); bad({ crop: { x: 0, y: 0, width: 0, height: 1 } }); bad({ quarterTurns: 4 }); bad({ flip: 1 });
  assert.throws(() => readSettings(null), { name: 'DevelopSettingsError' });
});
