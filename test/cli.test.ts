import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = fileURLToPath(new URL('../bin/p99conf.ts', import.meta.url));

function cli(args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
}

test('analyze passes when the bound clears the threshold', () => {
  const result = cli(['analyze', 'fixtures/checkout-latency.json', '--threshold', '5000']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verdict {4}PASS/);
  assert.match(result.stdout, /samples {4}1200/);
});

test('analyze fails when the bound sits above the threshold', () => {
  const result = cli(['analyze', 'fixtures/checkout-latency.json', '--threshold', '50']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /verdict {4}FAIL/);
});

test('analyze is undecided when the interval straddles the threshold', () => {
  const result = cli(['analyze', 'fixtures/small-sample.txt', '--percentile', '99', '--threshold', '1000']);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /verdict {4}UNDECIDED/);
});

test('analyze emits parseable JSON with the same verdict', () => {
  const result = cli(['analyze', 'fixtures/checkout-latency.json', '--threshold', '5000', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.count, 1200);
  assert.equal(payload.gate.verdict.outcome, 'pass');
  assert.equal(payload.gate.exceedance.of, 1200);
  assert.ok(payload.percentiles.length >= 4);
});

test('plan reports the one-sided sample requirement', () => {
  const result = cli(['plan', '--percentile', '99', '--confidence', '0.95', '--rank-fraction', '0.02']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /upper-bound samples {3}299/);
  assert.match(result.stdout, /interval samples/);
});

test('shards reports bounds instead of an average', () => {
  const result = cli(['shards', 'fixtures/shards.json', '--percentile', '99']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /merged p99 {6}\(410|merged p99/);
  assert.match(result.stdout, /not a valid merge/);
});

test('a missing file is a usage error, not a crash', () => {
  const result = cli(['analyze', 'fixtures/does-not-exist.json']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /cannot read/);
});

test('an unknown command is a usage error', () => {
  const result = cli(['frobnicate']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /unknown command/);
});

test('a malformed sample file is a usage error with a line number', () => {
  const result = cli(['analyze', 'fixtures/broken.txt']);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /not a finite number/);
});

test('help is available without arguments', () => {
  const result = cli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /p99conf - what your latency percentiles can actually support/);
});
