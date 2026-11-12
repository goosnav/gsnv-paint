import { test } from 'node:test'; import assert from 'node:assert/strict';
import { photoContent, kindOf } from './photo-content.ts';
import { defaultSettings, mergeSettings } from './develop-settings.ts';

test('P-CONTENT routes RAW formats to LibRaw and round-trips original bytes with settings', () => {
  assert.equal(kindOf('IMG_0001.CR2', ''), 'raw'); assert.equal(kindOf('a.dng', 'image/x-adobe-dng'), 'raw'); assert.equal(kindOf('a.jpg', 'image/jpeg'), 'display'); assert.equal(kindOf('x', 'image/x-sony-arw'), 'raw');
  const bytes = new Uint8Array([1, 2, 3]), doc = photoContent({ operation: 'new', name: 'beach.NEF', mime: '', bytes });
  assert.equal(doc.source.kind, 'raw'); assert.deepEqual(doc.settings, defaultSettings());
  const edited = { ...doc, settings: mergeSettings(doc.settings, { exposure: 0.7 }) }, encoded = photoContent({ operation: 'encode', value: edited });
  assert.equal(encoded.bytes, bytes); assert.equal(encoded.content.asset, 'source');
  const decoded = photoContent({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), bytes: encoded.bytes });
  assert.deepEqual(decoded.settings, edited.settings); assert.deepEqual(decoded.source, edited.source);
});

test('P-CONTENT rejects malformed projects and empty files', () => {
  const good = photoContent({ operation: 'encode', value: photoContent({ operation: 'new', name: 'a.jpg', mime: 'image/jpeg', bytes: new Uint8Array([9]) }) }).content;
  for (const content of [null, [], { ...good, extra: 1 }, { ...good, kind: 'film' }, { ...good, asset: 'x' }, { ...good, settings: { ...good.settings, exposure: 99 } }])
    assert.throws(() => photoContent({ operation: 'decode', content, bytes: new Uint8Array([1]) }), (e: Error) => ['PhotoContentError', 'DevelopSettingsError'].includes(e.name));
  assert.throws(() => photoContent({ operation: 'decode', content: good, bytes: new Uint8Array() }), { name: 'PhotoContentError' });
  assert.throws(() => photoContent({ operation: 'new', name: '', mime: '', bytes: new Uint8Array([1]) }), { name: 'PhotoContentError' });
});
