/**
 * Regenerates the committed fixtures. Deterministic: the same seed always
 * produces the same values, so the demo and the tests stay stable.
 *
 * Run with: node scripts/make_fixtures.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261122);
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// Lognormal request latencies: median about 141 ms, a realistic checkout tail.
function draw() {
  const u = Math.max(random(), 1e-9);
  const v = random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return round(Math.exp(4.95 + 0.42 * z));
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const main = Array.from({ length: 1200 }, draw);
writeFileSync(join(root, 'fixtures', 'checkout-latency.json'), `${JSON.stringify(main, null, 0)}\n`);

const small = Array.from({ length: 40 }, draw);
writeFileSync(
  join(root, 'fixtures', 'small-sample.txt'),
  `${small.join('\n')}\n`,
);

writeFileSync(
  join(root, 'fixtures', 'shards.json'),
  `${JSON.stringify([
    { name: 'web-1', count: 520000, percentile: 410 },
    { name: 'web-2', count: 430000, percentile: 455 },
    { name: 'web-3', count: 50000, percentile: 900 },
  ], null, 2)}\n`,
);

writeFileSync(join(root, 'fixtures', 'broken.txt'), '120.5\n98.2\nnot-a-number\n76.0\n');

console.log(`wrote fixtures: 1200 samples, 40 samples, 3 shards (seed 20261122)`);
console.log(`main p99 = ${[...main].sort((a, b) => a - b)[Math.ceil(0.99 * main.length) - 1]}`);
