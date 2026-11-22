import test from 'node:test';
import assert from 'node:assert/strict';
import { minSamplesForInterval, minSamplesForUpperBound, planReport } from '../src/plan.ts';

test('one-sided upper bound needs about 299 samples for p99 at 95%', () => {
  assert.equal(minSamplesForUpperBound(0.99, 0.95), 299);
  assert.equal(minSamplesForUpperBound(0.95, 0.95), 59);
  assert.equal(minSamplesForUpperBound(0.99, 0.99), 459);
});

test('sample size grows with confidence and with tail depth', () => {
  assert.ok(minSamplesForUpperBound(0.99, 0.99) > minSamplesForUpperBound(0.99, 0.9));
  assert.ok(minSamplesForUpperBound(0.999, 0.95) > minSamplesForUpperBound(0.99, 0.95));
});

test('interval planning finds a finite run size', () => {
  const n = minSamplesForInterval(0.99, 0.95, 0.02);
  assert.notEqual(n, null);
  assert.ok(n! >= 299);
  assert.ok(n! < 1_000_000);
});

test('a tighter rank fraction needs more samples', () => {
  const loose = minSamplesForInterval(0.99, 0.95, 0.04)!;
  const tight = minSamplesForInterval(0.99, 0.95, 0.01)!;
  assert.ok(tight > loose);
});

test('planReport explains the one-sided requirement', () => {
  const plan = planReport(99, 0.95, null);
  assert.equal(plan.minSamplesForUpperBound, 299);
  assert.equal(plan.minSamplesForInterval, null);
  assert.ok(plan.notes.some((note) => /299 samples/.test(note)));
  assert.ok(plan.notes.some((note) => /rank-fraction/.test(note)));
});

test('planReport with a rank fraction reports the interval size and window', () => {
  const plan = planReport(99, 0.95, 0.02);
  assert.equal(plan.maxRankFraction, 0.02);
  assert.ok(plan.minSamplesForInterval! > 0);
  assert.ok(plan.rankWindowAtInterval! > 1);
  assert.ok(plan.notes.some((note) => /sample ranks needs/.test(note)));
});

test('planning rejects impossible arguments', () => {
  assert.throws(() => minSamplesForUpperBound(1, 0.95), RangeError);
  assert.throws(() => minSamplesForUpperBound(0.99, 0), RangeError);
  assert.throws(() => minSamplesForInterval(0.99, 0.95, 0), RangeError);
  assert.throws(() => minSamplesForInterval(0.99, 0.95, 1), RangeError);
  assert.throws(() => planReport(0, 0.95), RangeError);
});
