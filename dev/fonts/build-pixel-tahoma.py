"""Build 'Pixel Tahoma': the 11-pixel bitmap strike of Wine Tahoma (Tahoma 8 pt at 96 dpi, the Windows XP
UI size) as an outline font whose glyphs are unions of whole-pixel squares, so browsers draw hard pixels.

Source: Wine fonts/tahoma.ttf and tahomabd.ttf ("WineTahoma", Larry Snyder, based on Bitstream Vera;
renamed per the Vera licence). Output keeps that licence; see dev/licenses/pixel-tahoma.NOTICE.txt.
Run: python3 dev/fonts/build-pixel-tahoma.py <wine-tahoma.ttf> <wine-tahomabd.ttf> <output-dir>
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PPEM, UNIT = 11, 100  # 1 pixel = 100 font units; render at 11 px (or 22 px for 2x) for exact pixels.

def build(source, family, style, out):
    src = TTFont(source)
    strike = next(i for i, s in enumerate(src['EBLC'].strikes) if s.bitmapSizeTable.ppemY == PPEM)
    table = src['EBLC'].strikes[strike].bitmapSizeTable
    ascent, descent = table.hori.ascender, table.hori.descender
    data = src['EBDT'].strikeData[strike]
    glyphs, advances, cmap = {'.notdef': TTGlyphPen(None).glyph()}, {'.notdef': (6 * UNIT, 0)}, {}
    order = ['.notdef']
    best = src.getBestCmap()
    for code, name in sorted(best.items()):
        g = data.get(name)
        if g is None:
            continue
        m = g.metrics
        pen = TTGlyphPen(None)
        top = m.horiBearingY if hasattr(m, 'horiBearingY') else m.BearingY
        left = m.horiBearingX if hasattr(m, 'horiBearingX') else m.BearingX
        advance = m.horiAdvance if hasattr(m, 'horiAdvance') else m.Advance
        for row in range(m.height):
            bits = ''.join(format(b, '08b') for b in g.getRow(row, bitDepth=1, metrics=m))[:m.width]
            x = 0
            while x < m.width:
                if bits[x] != '1':
                    x += 1; continue
                start = x
                while x < m.width and bits[x] == '1':
                    x += 1
                x0, x1 = (left + start) * UNIT, (left + x) * UNIT
                y1 = (top - row) * UNIT; y0 = y1 - UNIT
                pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        glyph_name = name if name not in glyphs else f'{name}.{code}'
        glyphs[glyph_name] = pen.glyph(); advances[glyph_name] = (advance * UNIT, max(0, left * UNIT))
        order.append(glyph_name); cmap[code] = glyph_name
    fb = FontBuilder(PPEM * UNIT, isTTF=True)
    fb.setupGlyphOrder(order); fb.setupCharacterMap(cmap); fb.setupGlyf(glyphs); fb.setupHorizontalMetrics(advances)
    fb.setupHorizontalHeader(ascent=ascent * UNIT, descent=descent * UNIT)
    fb.setupNameTable({'familyName': family, 'styleName': style, 'copyright': 'Bitmap glyphs from WineTahoma (c) 2004 Larry Snyder, based on Bitstream Vera Sans (c) 2003 Bitstream, Inc. Renamed per the Bitstream Vera licence.'})
    fb.setupOS2(sTypoAscender=ascent * UNIT, sTypoDescender=descent * UNIT, usWinAscent=ascent * UNIT, usWinDescent=-descent * UNIT, usWeightClass=700 if style == 'Bold' else 400)
    fb.setupPost(); fb.setupHead(unitsPerEm=PPEM * UNIT)
    fb.font['gasp'] = TTFont(source)['gasp'] if 'gasp' in TTFont(source) else None
    if fb.font['gasp'] is None: del fb.font['gasp']
    fb.font.flavor = 'woff2'
    fb.save(out)
    print(out, len(order), 'glyphs')

if __name__ == '__main__':
    regular, bold, out = sys.argv[1:4]
    build(regular, 'Pixel Tahoma', 'Regular', f'{out}/pixel-tahoma.woff2')
    build(bold, 'Pixel Tahoma', 'Bold', f'{out}/pixel-tahoma-bold.woff2')
