"""Generate original geometric glyph fixtures (no third-party font outlines).
Run: python3 dev/fixtures/fonts/generate.py (fontTools required for regeneration).
TTF and CFF OTF deliberately differ; tests can detect fallback font rendering.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen

out = Path(__file__).parent
for kind in ['ttf', 'otf']:
    fb = FontBuilder(1000, isTTF=kind == 'ttf')
    order = ['.notdef', 'space', 'A', 'B']
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({32: 'space', 65: 'A', 66: 'B'})
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None) if kind == 'ttf' else T2CharStringPen(700, None)
        if name != 'space':
            if kind == 'ttf':
                points = [(80, 0), (80, 700), (580, 700), (580, 450), (300, 450), (300, 0)]
            else:
                points = [(60, 0), (350, 720), (640, 0)]
            pen.moveTo(points[0])
            for point in points[1:]: pen.lineTo(point)
            pen.closePath()
        glyphs[name] = pen.glyph() if kind == 'ttf' else pen.getCharString()
    fb.setupHorizontalMetrics({name: (700, 0 if name == 'space' else 60) for name in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': 'Paint Test ' + kind.upper(), 'styleName': 'Regular', 'uniqueFontIdentifier': 'PaintOriginalFixture-' + kind, 'fullName': 'Paint Test ' + kind.upper(), 'psName': 'PaintTest-' + kind})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    if kind == 'ttf': fb.setupGlyf(glyphs)
    else: fb.setupCFF('PaintTest-otf', {'FullName': 'Paint Test OTF', 'FamilyName': 'Paint Test OTF', 'Weight': 'Regular'}, glyphs, {})
    fb.setupMaxp()
    fb.font['head'].created = fb.font['head'].modified = 3800000000
    fb.save(out / ('Paint Test.' + kind))
