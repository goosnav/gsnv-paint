import { C } from './xp-pixels.mjs';

// Original, hand-plotted command artwork on a 16 × 16 pixel grid.
// Copyright (c) 2026 Goosnav LLC. MIT; see XP-LICENSE.txt.
// All visible pixels stay inside the one-pixel transparent outer margin.
// These are period-style drawings, not extracted Microsoft resources.

function box(p, x, y, width, height, fill, border = C.ink) {
  p.rect(x, y, width, height, border);
  p.rect(x + 1, y + 1, width - 2, height - 2, fill);
}

function paper(p, x, y, width, height) {
  const right = x + width - 1;
  const bottom = y + height - 1;
  p.poly([[x, y], [right - 3, y], [right, y + 3], [right, bottom], [x, bottom]], C.white, C.ink);
  p.poly([[right - 3, y], [right - 3, y + 3], [right, y + 3]], C.light, C.ink);
}

function historyArrow(p, mirror) {
  const x = (value) => mirror ? 15 - value : value;
  p.poly([
    [1, 6], [5, 2], [5, 4], [9, 4], [12, 6], [13, 9],
    [13, 12], [11, 12], [11, 9], [9, 7], [5, 7], [5, 10],
  ].map(([px, py]) => [x(px), py]), C.yellow, C.ink);
  p.line(x(6), 5, x(9), 5, C.white);
  p.line(x(12), 9, x(12), 11, C.gold);
}

function magnifier(p, plus) {
  p.poly([[9, 8], [14, 12], [12, 14], [8, 10]], C.blue, C.ink);
  p.line(10, 10, 12, 12, C.sky);
  p.ellipse(2, 1, 9, 9, C.white, C.ink);
  p.line(4, 2, 7, 2, C.sky);
  p.pixel(3, 3, C.sky);
  p.line(4, 5, 8, 5, C.ink);
  if (plus) p.line(6, 3, 6, 7, C.ink);
}

export const commandIcons = Object.freeze({
  new(p) {
    paper(p, 3, 1, 10, 14);
  },

  open(p) {
    p.poly([[1, 4], [5, 4], [6, 6], [13, 6], [13, 12], [1, 12]], C.gold, C.ink);
    p.line(2, 5, 4, 5, C.yellow);
    p.poly([[2, 7], [14, 7], [12, 13], [1, 13]], C.yellow, C.ink);
    p.line(3, 8, 12, 8, C.white);
    p.line(2, 12, 11, 12, C.gold);
  },

  save(p) {
    p.poly([[2, 1], [11, 1], [13, 3], [13, 14], [2, 14]], C.blue, C.ink);
    p.rect(4, 2, 7, 5, C.light);
    p.line(4, 2, 6, 2, C.white);
    p.rect(8, 2, 2, 4, C.gray);
    p.line(4, 6, 10, 6, C.ink);
    box(p, 4, 9, 8, 6, C.white);
    p.line(6, 11, 9, 11, C.sky);
    p.pixel(3, 12, C.sky);
  },

  export(p) {
    paper(p, 2, 1, 9, 13);
    p.line(4, 6, 7, 6, C.gray);
    p.poly([[10, 5], [14, 9], [10, 13], [10, 10], [6, 10], [6, 8], [10, 8]], C.green, C.ink);
    p.line(7, 9, 11, 9, C.paleGreen);
  },

  undo(p) {
    historyArrow(p, false);
  },

  redo(p) {
    historyArrow(p, true);
  },

  copy(p) {
    paper(p, 1, 1, 9, 11);
    p.line(3, 6, 6, 6, C.gray);
    p.line(3, 8, 4, 8, C.gray);
    paper(p, 5, 4, 9, 11);
    p.line(7, 9, 11, 9, C.blue);
    p.line(7, 11, 10, 11, C.gray);
  },

  paste(p) {
    box(p, 2, 3, 11, 12, C.gold);
    p.rect(4, 5, 8, 8, C.white);
    p.line(5, 8, 10, 8, C.blue);
    p.line(5, 10, 9, 10, C.gray);
    box(p, 5, 1, 5, 4, C.light);
    p.line(6, 2, 8, 2, C.white);
  },

  cut(p) {
    p.poly([[3, 1], [8, 7], [7, 9], [2, 3]], C.light, C.ink);
    p.poly([[12, 1], [13, 3], [8, 9], [6, 7]], C.white, C.ink);
    p.line(5, 10, 7, 8, C.ink);
    p.line(10, 10, 8, 8, C.ink);
    p.ellipse(2, 9, 5, 5, C.sky, C.ink);
    p.ellipse(3, 10, 3, 3, C.white);
    p.ellipse(9, 9, 5, 5, C.sky, C.ink);
    p.ellipse(10, 10, 3, 3, C.white);
    p.pixel(7, 7, C.gray);
  },

  crop(p) {
    p.poly([[3, 1], [5, 1], [5, 10], [14, 10], [14, 12], [3, 12]], C.ink);
    p.line(4, 2, 4, 10, C.light);
    p.line(5, 11, 13, 11, C.gray);
    p.poly([[1, 3], [12, 3], [12, 14], [10, 14], [10, 5], [1, 5]], C.ink);
    p.line(2, 4, 11, 4, C.white);
    p.line(11, 5, 11, 13, C.gray);
  },

  rotate(p) {
    p.poly([
      [9, 1], [12, 3], [12, 5], [14, 5], [11, 9], [8, 5],
      [10, 5], [10, 4], [8, 3], [5, 3], [3, 5], [3, 9],
      [5, 11], [8, 11], [8, 13], [4, 13], [1, 10], [1, 4], [4, 1],
    ], C.green, C.ink);
    p.line(5, 2, 8, 2, C.paleGreen);
    p.line(2, 5, 2, 9, C.paleGreen);
    p.line(5, 12, 7, 12, C.paleGreen);
  },

  flip(p) {
    for (let y = 2; y <= 14; y += 2) p.pixel(8, y, C.gray);
    p.poly([[1, 11], [6, 4], [6, 11]], C.sky, C.ink);
    p.poly([[10, 4], [14, 11], [10, 11]], C.light, C.ink);
    p.line(4, 10, 5, 10, C.white);
    p.line(11, 10, 12, 10, C.white);
  },

  layerAdd(p) {
    p.poly([[1, 5], [7, 2], [13, 5], [7, 8]], C.light, C.ink);
    p.poly([[1, 8], [7, 5], [13, 8], [7, 11]], C.white, C.ink);
    p.poly([
      [10, 8], [12, 8], [12, 10], [14, 10], [14, 12], [12, 12],
      [12, 14], [10, 14], [10, 12], [8, 12], [8, 10], [10, 10],
    ], C.green, C.ink);
    p.line(9, 11, 13, 11, C.paleGreen);
    p.line(11, 9, 11, 13, C.paleGreen);
  },

  hand(p) {
    p.poly([
      [2, 8], [3, 7], [5, 9], [5, 3], [6, 2], [7, 3],
      [7, 1], [8, 1], [9, 2], [9, 3], [10, 2], [11, 3],
      [11, 5], [12, 4], [13, 5], [13, 10], [12, 13], [10, 14],
      [6, 14], [4, 12],
    ], C.white, C.ink);
    p.line(7, 4, 7, 7, C.ink);
    p.line(9, 4, 9, 7, C.ink);
    p.line(11, 6, 11, 8, C.ink);
    p.line(12, 7, 12, 10, C.light);
    p.line(6, 13, 10, 13, C.light);
  },

  zoomIn(p) {
    magnifier(p, true);
  },

  zoomOut(p) {
    magnifier(p, false);
  },

  fit(p) {
    for (const [x, y, dx, dy] of [[1, 1, 1, 1], [14, 1, -1, 1], [1, 14, 1, -1], [14, 14, -1, -1]]) {
      p.line(x, y, x + 4 * dx, y, C.ink);
      p.line(x, y, x, y + 4 * dy, C.ink);
      p.line(x + 2 * dx, y + 2 * dy, x + 4 * dx, y + 4 * dy, C.blue);
      p.line(x + 2 * dx, y + 2 * dy, x + 3 * dx, y + 2 * dy, C.blue);
      p.line(x + 2 * dx, y + 2 * dy, x + 2 * dx, y + 3 * dy, C.blue);
    }
    box(p, 6, 6, 4, 4, C.sky, C.blue);
  },

  paintTransform(p) {
    for (let coordinate = 4; coordinate <= 10; coordinate += 2) {
      p.pixel(coordinate, 2, C.ink);
      p.pixel(coordinate, 12, C.ink);
      p.pixel(2, coordinate, C.ink);
      p.pixel(12, coordinate, C.ink);
    }
    for (const [x, y] of [[1, 1], [11, 1], [1, 11], [11, 11]]) {
      box(p, x, y, 3, 3, C.white);
    }
  },
});
