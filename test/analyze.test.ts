import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, decide } from '../src/analyze.ts';
import { orderStatInterval } from '../src/stats.ts';

const samples = (n: number): number[] => Array.from({ length: n }, (_, i) => (i + 1) * 2);

test('analyze reports the requested percentiles plus the gate percentile', () => {
  const report = analyze(samples(500), { percentiles: [50, 95], gatePercentile: 99 });
  assert.deepEqual(report.percentiles.map((item) => item.percentile), [50, 95, 99]);
  assert.equal(report.count, 500);
  assert.equal(report.min, 2);
  assert.equal(report.max, 1000);
});

test('analyze without a threshold leaves the gate empty', () => {
  const report = analyze(samples(500));
  assert.equal(report.gate, null);
  assert.ok(report.resolution.smallestEstimable > 99);
});

test('a threshold far above the data is a PASS', () => {
  const report = analyze(samples(500), { threshold: 5000 });
  assert.equal(report.gate?.verdict?.outcome, 'pass');
  assert.equal(report.gate?.verdict?.exitCode, 0);
  assert.match(report.gate!.verdict!.detail, /at or below the threshold/);
});

test('a threshold below the data is a FAIL', () => {
  const report = analyze(samples(500), { threshold: 10 });
  assert.equal(report.gate?.verdict?.outcome, 'fail');
  assert.equal(report.gate?.verdict?.exitCode, 1);
  assert.match(report.gate!.verdict!.detail, /above the threshold/);
});

test('a threshold inside the interval is UNDECIDED, not a pass', () => {
  const data = samples(500);
  const interval = orderStatInterval(data.sort((a, b) => a - b), 0.99, 0.95);
  const threshold = (interval.lower! + interval.upper!) / 2;
  const report = analyze(data, { threshold });
  assert.equal(report.gate?.verdict?.outcome, 'undecided');
  assert.equal(report.gate?.verdict?.exitCode, 2);
  assert.match(report.gate!.verdict!.detail, /cannot settle/);
});

test('a small sample with a high threshold is undecided, not a pass', () => {
  const report = analyze(samples(40), { threshold: 1000 });
  assert.equal(report.gate?.verdict?.outcome, 'undecided');
  const p99 = report.percentiles.find((item) => item.percentile === 99)!;
  assert.equal(p99.upper, null);
  assert.ok(p99.maxBoundCoverage < 0.95);
});

test('exceedance counts strictly greater values and gives a Wilson interval', () => {
  const report = analyze(samples(500), { threshold: 1000 });
  const ex = report.gate!.exceedance!;
  assert.equal(ex.over, 0);
  assert.equal(ex.of, 500);
  assert.equal(ex.estimate, 0);
  assert.ok(ex.lower >= 0 && ex.lower < 1e-12);
  assert.ok(ex.upper > 0);
});

test('the resolution note names the highest estimable percentile', () => {
  const report = analyze(samples(100));
  assert.equal(report.resolution.n, 100);
  assert.equal(report.resolution.smallestEstimable, 99);
  assert.match(report.resolution.note, /with 100 samples/);
});

test('invalid confidence and percentile ranges are rejected', () => {
  assert.throws(() => analyze(samples(10), { confidence: 1 }), RangeError);
  assert.throws(() => analyze(samples(10), { percentile: 0, gatePercentile: 0 } as never), RangeError);
});

test('decide reports undecided when no upper bound exists', () => {
  const interval = orderStatInterval([1, 2, 3, 4, 5], 0.99, 0.95);
  const verdict = decide(interval, 5, 1000);
  assert.equal(verdict.outcome, 'undecided');
  assert.match(verdict.detail, /no .* upper bound/);
});

test('analyze rejects empty input rather than reporting zeros', () => {
  assert.throws(() => analyze([]), /no samples/);
});
