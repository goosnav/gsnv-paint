// Original Windows XP-style Paint toolbox: native 24px, fine pixel outlines,
// transparent geometric tools and saturated shared colour accents.
// Copyright (c) 2026 Goosnav LLC. MIT; see XP-LICENSE.txt.
import { C } from './xp-pixels.mjs';

export const toolIcons = {
  paintMove(p) {
    p.poly([[11,2],[15,6],[12,6],[12,10],[17,10],[17,7],[21,11],[17,15],[17,12],[12,12],[12,17],[15,17],[11,21],[7,17],[10,17],[10,12],[6,12],[6,15],[2,11],[6,7],[6,10],[10,10],[10,6],[7,6]], C.ink, C.ink);
    p.line(11,6,11,16,C.white); p.line(6,11,16,11,C.white);
  },
  paintSelect(p) {
    for (let x = 3; x <= 20; x += 3) { p.rect(x,4,2,1,C.ink); p.rect(x,19,2,1,C.ink); }
    for (let y = 6; y < 19; y += 3) { p.rect(3,y,1,2,C.ink); p.rect(20,y,1,2,C.ink); }
  },
  paintEllipseSelect(p) {
    // Separate dashes follow the ellipse; gaps stay transparent.
    for (const [x,y,w,h] of [[9,3,3,1],[14,4,3,1],[19,6,1,2],[20,10,1,3],[19,15,1,2],[15,18,3,1],[10,19,3,1],[5,18,3,1],[3,15,1,2],[2,10,1,3],[3,6,1,2],[5,4,3,1]]) p.rect(x,y,w,h,C.ink);
  },
  paintLasso(p) {
    p.poly([[6,4],[12,3],[18,5],[20,9],[18,13],[12,15],[5,14],[3,10],[4,6]],undefined,C.ink);
    p.line(7,13,9,17,C.ink); p.line(9,17,8,20,C.ink); p.line(8,20,5,21,C.ink);
    p.line(6,5,11,4,C.light); p.line(18,7,19,9,C.light);
  },
  paintWand(p) {
    p.poly([[4,18],[15,7],[18,10],[7,21]],C.ink,C.ink);
    p.line(6,18,14,10,C.light); p.poly([[14,8],[16,6],[19,9],[17,11]],C.white,C.ink);
    p.line(16,2,16,4,C.gold); p.line(20,4,21,3,C.gold); p.line(20,7,21,7,C.gold);
    p.line(10,3,10,7,C.gold); p.line(8,5,12,5,C.gold);
  },
  paintPencil(p) {
    p.poly([[3,20],[5,14],[17,2],[21,6],[9,18]],C.yellow,C.ink);
    p.poly([[3,20],[5,14],[9,18]],C.skin,C.ink); p.line(3,20,4,18,C.ink);
    p.line(7,14,17,4,C.white); p.line(9,16,19,6,C.gold);
    p.poly([[17,2],[18,1],[22,5],[21,6]],C.pink,C.ink);
    p.line(16,3,20,7,C.gray);
  },
  paintBrush(p) {
    p.poly([[11,13],[17,2],[19,1],[21,3],[13,15]],C.brown,C.ink);
    p.line(13,11,19,3,C.gold);
    p.poly([[8,13],[10,11],[14,15],[12,17]],C.light,C.ink);
    p.line(10,13,12,15,C.white);
    p.poly([[8,14],[11,17],[10,20],[7,21],[2,21],[5,18],[5,16]],C.ink,C.ink);
    p.line(7,16,7,19,C.gray); p.pixel(5,20,C.light);
  },
  paintAirbrush(p) {
    p.rect(4,10,8,11,C.ink); p.rect(5,11,6,9,C.light); p.rect(5,12,2,7,C.white);
    p.rect(5,8,6,2,C.gray); p.line(5,8,10,8,C.ink);
    p.rect(7,5,4,3,C.ink); p.rect(8,6,2,1,C.white); p.rect(11,6,2,2,C.ink);
    for (const [x,y] of [[15,6],[17,4],[18,7],[20,2],[21,5],[20,9],[16,9],[21,12]]) p.pixel(x,y,C.ink);
    p.line(5,20,10,20,C.gray);
  },
  paintEraser(p) {
    p.poly([[3,13],[11,19],[21,10],[21,14],[11,22],[3,17]],C.light,C.ink);
    p.poly([[3,13],[13,4],[21,10],[11,19]],C.pink,C.ink);
    p.poly([[3,13],[7,9],[15,15],[11,19]],C.white,C.ink);
    p.line(11,19,11,22,C.ink); p.line(14,6,19,10,C.red);
  },
  paintClone(p) {
    p.ellipse(8,2,8,7,C.blue,C.ink); p.rect(10,8,4,5,C.ink); p.rect(11,8,2,4,C.light);
    p.pixel(10,4,C.white); p.line(11,3,12,3,C.sky);
    p.poly([[7,13],[16,13],[19,17],[4,17]],C.light,C.ink);
    p.rect(3,17,17,4,C.ink); p.rect(4,18,15,1,C.gray); p.line(5,16,18,16,C.white);
  },
  paintBlur(p) {
    p.poly([[12,2],[15,7],[18,11],[19,15],[17,19],[14,21],[10,21],[6,19],[4,15],[5,11],[9,7]],C.sky,C.ink);
    p.poly([[12,4],[12,11],[8,15],[7,17],[6,14],[8,10]],C.white);
    p.line(7,18,10,20,C.blue); p.line(10,20,14,20,C.blue); p.line(15,19,17,17,C.blue);
  },
  paintSmudge(p) {
    p.poly([[5,13],[8,14],[8,5],[9,3],[11,3],[12,5],[12,11],[14,9],[16,10],[17,12],[19,12],[20,15],[18,20],[15,21],[9,21],[5,17],[3,15],[3,13]],C.skin,C.ink);
    p.line(10,5,10,11,C.white); p.line(12,12,12,15,C.brown); p.line(15,12,15,15,C.brown); p.line(18,14,17,17,C.brown);
    p.line(6,15,9,18,C.white); p.line(10,20,15,20,C.brown);
  },
  paintFill(p) {
    // Single tapered metal pail, with its wire handle behind the body.
    p.poly([[5,10],[2,7],[2,4],[4,2],[7,2],[10,4]],undefined,C.ink);
    p.line(4,3,7,3,C.light);
    p.poly([[10,4],[18,11],[11,18],[8,17],[3,12],[3,10]],C.light,C.ink);
    p.line(5,10,5,12,C.white); p.line(5,12,10,17,C.white);
    p.line(7,14,10,17,C.gray);
    // One narrow oval rim, viewed diagonally, with blue paint inside.
    p.poly([[10,3],[12,3],[16,6],[19,10],[18,12],[16,11],[12,7],[10,5]],C.blue,C.ink);
    p.line(11,4,15,7,C.sky); p.line(11,6,16,11,C.white);
    // The pour connects the low lip directly to a rounded puddle.
    p.poly([[18,10],[19,10],[21,13],[21,18],[22,20],[21,21],[15,21],[14,20],[16,19],[18,19],[19,16],[19,13],[17,12]],C.blue,C.ink);
    p.line(19,12,20,14,C.sky); p.line(20,14,20,17,C.sky);
    p.line(16,20,18,20,C.sky); p.pixel(18,11,C.blue);
  },
  paintGradient(p) {
    p.rect(3,5,18,14,C.ink); p.rect(4,6,4,12,C.ink); p.rect(8,6,4,12,C.gray);
    p.rect(12,6,4,12,C.light); p.rect(16,6,4,12,C.white);
    for (let y = 6; y < 18; y += 2) { p.pixel(8,y,C.ink); p.pixel(12,y+1,C.gray); p.pixel(16,y,C.light); }
  },
  paintPicker(p) {
    p.poly([[4,17],[13,8],[16,11],[7,20],[3,21]],C.white,C.ink);
    p.line(6,17,13,10,C.sky); p.line(4,19,5,18,C.blue);
    p.poly([[11,7],[13,5],[18,10],[16,12]],C.light,C.ink);
    p.poly([[14,5],[16,2],[19,2],[22,5],[22,7],[19,10]],C.ink,C.ink);
    p.line(17,3,19,4,C.gray); p.pixel(16,4,C.light);
  },
  paintText(p) {
    // Plain serif A, as in the classic toolbox; no bevel, fill gradient or shadow.
    p.poly([[10,3],[12,3],[6,20],[4,20]],C.ink);
    p.poly([[11,3],[13,3],[20,20],[16,20]],C.ink);
    p.rect(8,13,7,2,C.ink); p.rect(2,20,7,1,C.ink); p.rect(15,20,7,1,C.ink);
  },
  paintLine(p) { p.line(3,20,20,3,C.ink); p.line(4,20,21,3,C.ink); },
  paintRectangle(p) { p.poly([[3,5],[20,5],[20,19],[3,19]],undefined,C.ink); },
  paintEllipse(p) { p.ellipse(2,5,20,15,undefined,C.ink); },
};
