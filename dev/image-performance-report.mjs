/** Summarize same-runner measurements; correctness is gated by the browser tests. */
import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.argv[2] ?? 'test-results/image-performance';
async function reports(path) {
  let entries; try { entries = await readdir(path, { withFileTypes: true }); } catch { return []; }
  const result = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await reports(child));
    else if (entry.name === 'interaction.json') result.push(JSON.parse(await readFile(child, 'utf8')));
  }
  return result;
}
function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, medianMs: null, p95Ms: null, maxMs: null };
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { count: sorted.length, medianMs: median, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
}
const results = (await reports(directory)).sort((a, b) => a.variant.localeCompare(b.variant)).map(report => {
  const metrics = {};
  for (const [name, phase, event, drag] of [
    ['strokeStart', 'drawing', 'pointerdown', false], ['drawing', 'drawing', 'pointermove', true],
    ['strokeEnd', 'drawing', 'pointerup', false], ['hover', 'hover', 'pointermove', false],
  ]) {
    const samples = report.samples.filter(sample => sample.phase === phase && sample.event === event && (!drag || sample.buttons & 1));
    metrics[name] = { handler: distribution(samples.map(sample => sample.handlerMs)), nextAnimationFrame: distribution(samples.map(sample => sample.nextFrameMs)) };
  }
  const tasks = report.longTasks.filter(task => task.start >= report.measuredStart && task.start <= report.measuredEnd);
  return { variant: report.variant, revision: report.revision, browser: report.browser, platform: report.platform,
    dimensions: report.dimensions, strokes: report.strokes, stableLayerRow: report.stableLayerRow, metrics,
    drawingLongTasks: { count: tasks.length, totalMs: tasks.reduce((sum, task) => sum + task.duration, 0), maxMs: Math.max(0, ...tasks.map(task => task.duration)) } };
});
if (!results.length) {
  console.log('No completed interaction reports. Check the browser-test failure and retained trace.');
} else {
  await writeFile(join(directory, 'summary.json'), JSON.stringify(results, null, 2));
  const ms = value => value === null ? 'n/a' : `${value.toFixed(1)} ms`;
  const lines = [
    '## Image performance: 2550 × 3300, one layer', '',
    '| Build | Stroke start handler (median) | Stroke end handler (median) | Stroke end → next frame (median) | Hover handler (median) | Long tasks while drawing |',
    '|---|---:|---:|---:|---:|---:|',
    ...results.map(result => `| ${result.variant} ${result.revision.slice(0, 12)} | ${ms(result.metrics.strokeStart.handler.medianMs)} | ${ms(result.metrics.strokeEnd.handler.medianMs)} | ${ms(result.metrics.strokeEnd.nextAnimationFrame.medianMs)} | ${ms(result.metrics.hover.handler.medianMs)} | ${result.drawingLongTasks.count} / ${ms(result.drawingLongTasks.totalMs)} |`),
    '', 'Both builds run serially on the same CI runner. Event samples and percentiles are in the JSON artifact. Next-frame timing includes pending main-thread work; it is not physical display latency. Timings are observations, not brittle CI pass/fail thresholds.', '',
  ];
  const markdown = lines.join('\n'); console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}
