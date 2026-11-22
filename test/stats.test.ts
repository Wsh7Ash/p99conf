import test from 'node:test';
import assert from 'node:assert/strict';
import {
  binomCdf,
  ibeta,
  lgamma,
  normalQuantile,
  orderStatInterval,
  percentile,
  sortSamples,
  upperBoundFromMax,
  wilson,
} from '../src/stats.ts';

test('lgamma matches known factorial values', () => {
  assert.ok(Math.abs(lgamma(1) - 0) < 1e-12);
  assert.ok(Math.abs(lgamma(5) - Math.log(24)) < 1e-9);
  assert.ok(Math.abs(lgamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-9);
});

test('ibeta is the regularized incomplete beta', () => {
  assert.ok(Math.abs(ibeta(1, 1, 0.37) - 0.37) < 1e-12);
  assert.equal(ibeta(2, 3, 0), 0);
  assert.equal(ibeta(2, 3, 1), 1);
  assert.ok(Math.abs(ibeta(2, 2, 0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(ibeta(3, 4, 0.25) - 0.16943359375) < 1e-9);
});

test('binomCdf agrees with the binomial expansion', () => {
  assert.ok(Math.abs(binomCdf(5, 10, 0.5) - 0.623046875) < 1e-9);
  assert.ok(Math.abs(binomCdf(0, 10, 0.5) - 0.0009765625) < 1e-12);
  assert.ok(Math.abs(binomCdf(0, 40, 0.99) - Math.pow(0.01, 40)) < 1e-9);
  assert.ok(Math.abs(binomCdf(40, 40, 0.99) - 1) < 1e-12);
  assert.equal(binomCdf(-1, 10, 0.5), 0);
  assert.equal(binomCdf(10, 10, 0.5), 1);
});

test('percentile uses nearest rank', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(samples, 0.5), 50);
  assert.equal(percentile(samples, 0.95), 95);
  assert.equal(percentile(samples, 0.99), 99);
  assert.equal(percentile(samples, 1), 100);
  assert.equal(percentile([7], 0.99), 7);
  assert.throws(() => percentile([], 0.5), /no samples/);
  assert.throws(() => percentile([1, 2], 0), RangeError);
});

test('sortSamples sorts a copy and rejects non-finite input', () => {
  const input = [3, 1, 2];
  assert.deepEqual(sortSamples(input), [1, 2, 3]);
  assert.deepEqual(input, [3, 1, 2]);
  assert.throws(() => sortSamples([1, Number.NaN]), /index 1/);
  assert.throws(() => sortSamples(['1']), /index 0/);
});

test('order-statistic interval brackets the point estimate', () => {
  const samples = Array.from({ length: 1000 }, (_, i) => i + 1);
  const interval = orderStatInterval(samples, 0.99, 0.95);
  const point = percentile(samples, 0.99);
  assert.notEqual(interval.lower, null);
  assert.notEqual(interval.upper, null);
  assert.ok(interval.lower! < point);
  assert.ok(interval.upper! > point);
  assert.ok(interval.coverage >= 0.95);
  assert.ok(interval.coverage <= 1);
});

test('order-statistic interval widens with confidence', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => i * 1.5);
  const ninety = orderStatInterval(samples, 0.95, 0.9);
  const ninetynine = orderStatInterval(samples, 0.95, 0.99);
  assert.ok(ninetynine.lower! <= ninety.lower!);
  assert.ok(ninetynine.upper! >= ninety.upper!);
});

test('small samples collapse to a one-sided bound instead of a guess', () => {
  const interval = orderStatInterval([1, 2, 3, 4, 5], 0.99, 0.95);
  assert.equal(interval.lowerRank, 5);
  assert.equal(interval.upperRank, null);
  assert.equal(interval.lower, 5);
  assert.equal(interval.upper, null);
  // P(max <= population p99) = 0.99^5, so the maximum is a 95.1% lower bound.
  assert.ok(Math.abs(interval.coverage - Math.pow(0.99, 5)) < 1e-6);
});

test('upper bound from the maximum carries 1 - p^n coverage', () => {
  const samples = Array.from({ length: 299 }, (_, i) => i);
  const bound = upperBoundFromMax(samples, 0.99, 0.95);
  assert.equal(bound.upper, 298);
  assert.ok(bound.coverage > 0.95 && bound.coverage < 0.96);
  assert.equal(bound.adequate, true);
  const weak = upperBoundFromMax(samples.slice(0, 50), 0.99, 0.95);
  assert.equal(weak.adequate, false);
});

test('wilson interval stays inside [0, 1] at the edges', () => {
  const zero = wilson(0, 1200);
  assert.ok(zero.lower >= 0 && zero.lower < 1e-12);
  assert.ok(zero.upper > 0 && zero.upper < 0.01);
  const all = wilson(1200, 1200);
  assert.equal(all.upper, 1);
  assert.ok(all.lower > 0.99);
  const mid = wilson(600, 1200);
  assert.ok(mid.lower < 0.5 && mid.upper > 0.5);
});

test('normalQuantile matches the familiar critical values', () => {
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959964) < 1e-4);
  assert.ok(Math.abs(normalQuantile(0.5) - 0) < 1e-9);
  assert.ok(Math.abs(normalQuantile(0.99) - 2.326348) < 1e-4);
});

test('reported coverage is never below the requested confidence', () => {
  for (const n of [50, 137, 500, 1200, 5000]) {
    const samples = Array.from({ length: n }, (_, i) => i);
    for (const p of [0.5, 0.9, 0.95, 0.99]) {
      const interval = orderStatInterval(samples, p, 0.95);
      assert.ok(
        interval.coverage >= 0.95 - 1e-12,
        `n=${n} p=${p} coverage=${interval.coverage}`,
      );
    }
  }
});

test('coverage holds the requested level and the rank window grows with n', () => {
  const small = orderStatInterval(Array.from({ length: 200 }, (_, i) => i), 0.9, 0.95);
  const large = orderStatInterval(Array.from({ length: 2000 }, (_, i) => i), 0.9, 0.95);
  assert.ok(small.coverage >= 0.95);
  assert.ok(large.coverage >= 0.95);
  assert.ok(large.upperRank! - large.lowerRank! > small.upperRank! - small.lowerRank!);
});
