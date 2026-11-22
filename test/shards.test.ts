import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShards, shardBounds, ShardFormatError } from '../src/shards.ts';

const shards = [
  { name: 'web-1', count: 520_000, percentile: 410 },
  { name: 'web-2', count: 430_000, percentile: 455 },
  { name: 'web-3', count: 50_000, percentile: 900 },
];

test('bounds are the smallest and largest shard percentiles', () => {
  const bounds = shardBounds(shards, 99);
  assert.equal(bounds.lower, 410);
  assert.equal(bounds.upper, 900);
  assert.equal(bounds.totalCount, 1_000_000);
  assert.equal(bounds.exact, false);
  assert.match(bounds.note, /lies between 410 and 900/);
});

test('the averaging mistake is reported but labelled invalid', () => {
  const bounds = shardBounds(shards, 99);
  assert.ok(Math.abs(bounds.meanOfShardPercentiles - 588.333) < 0.001);
  assert.ok(bounds.weightedMean < bounds.upper);
  assert.match(bounds.note, /not bounds/);
});

test('identical shard percentiles make the merge exact', () => {
  const bounds = shardBounds([
    { name: 'a', count: 10, percentile: 250 },
    { name: 'b', count: 90, percentile: 250 },
  ], 99);
  assert.equal(bounds.exact, true);
  assert.equal(bounds.lower, 250);
  assert.equal(bounds.upper, 250);
  assert.match(bounds.note, /exactly that value/);
});

test('largest share reflects traffic concentration', () => {
  const bounds = shardBounds([
    { name: 'a', count: 990, percentile: 100 },
    { name: 'b', count: 10, percentile: 400 },
  ], 99);
  assert.equal(bounds.largestShare, 0.99);
});

test('shard summaries parse from JSON with default names', () => {
  const parsed = parseShards('[{"count": 10, "percentile": 100}, {"name": "b", "count": 5, "p99": 120}]');
  assert.deepEqual(parsed, [
    { name: 'shard-1', count: 10, percentile: 100 },
    { name: 'b', count: 5, percentile: 120 },
  ]);
});

test('shard summaries parse from CSV with and without a header', () => {
  const withHeader = parseShards('name,count,percentile\nweb-1,520000,410\nweb-2,430000,455\n');
  assert.equal(withHeader.length, 2);
  assert.equal(withHeader[1].percentile, 455);
  const withoutHeader = parseShards('web-1,10,100\nweb-2,20,200\n');
  assert.equal(withoutHeader[1].name, 'web-2');
});

test('invalid shard input is rejected', () => {
  assert.throws(() => parseShards(''), /input is empty/);
  assert.throws(() => parseShards('[]'), /non-empty array/);
  assert.throws(() => parseShards('[{"count": 0, "percentile": 5}]'), ShardFormatError);
  assert.throws(() => shardBounds([], 99), ShardFormatError);
  assert.throws(() => shardBounds([{ name: 'a', count: -1, percentile: 5 }], 99), ShardFormatError);
  assert.throws(() => shardBounds(shards, 0), RangeError);
});
