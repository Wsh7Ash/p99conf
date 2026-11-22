import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSamples, SampleFormatError } from '../src/parse.ts';

test('parses a JSON array of numbers', () => {
  assert.deepEqual(parseSamples('[12, 8.5, 30]'), [12, 8.5, 30]);
});

test('parses a JSON array of objects with an explicit field', () => {
  const text = '[{"latency_ms": 10, "status": 200}, {"latency_ms": 20, "status": 500}]';
  assert.deepEqual(parseSamples(text, { field: 'latency_ms' }), [10, 20]);
});

test('picks the first numeric field when none is given', () => {
  const text = '[{"name": "a", "ms": 5}, {"name": "b", "ms": 6}]';
  assert.deepEqual(parseSamples(text), [5, 6]);
});

test('reports a missing field with the item index', () => {
  assert.throws(
    () => parseSamples('[{"ms": 5}]', { field: 'latency' }),
    /item 0 has no field "latency"/,
  );
});

test('parses JSON Lines of objects', () => {
  const text = '{"ms": 4}\n{"ms": 9}\n{"ms": 1}\n';
  assert.deepEqual(parseSamples(text), [4, 9, 1]);
});

test('parses CSV using a latency-shaped header column', () => {
  const text = 'timestamp,status,latency_ms\n1,200,31.5\n2,200,44\n3,500,90\n';
  assert.deepEqual(parseSamples(text), [31.5, 44, 90]);
});

test('parses CSV with a named column', () => {
  const text = 'time,value\n1,10\n2,20\n';
  assert.deepEqual(parseSamples(text, { field: 'value' }), [10, 20]);
});

test('rejects a CSV header without the requested column', () => {
  const text = 'time,value\n1,10\n';
  assert.throws(() => parseSamples(text, { field: 'latency' }), /no column "latency"/);
});

test('parses tab separated files', () => {
  const text = 'name\tms\na\t10.5\nb\t12.5\n';
  assert.deepEqual(parseSamples(text), [10.5, 12.5]);
});

test('parses one number per line and skips comments', () => {
  assert.deepEqual(parseSamples('10\n# warmup\n12.5\n\n7\n'), [10, 12.5, 7]);
});

test('reports the line number of a malformed plain-text sample', () => {
  assert.throws(() => parseSamples('10\nfast\n20\n'), (error: unknown) => {
    assert.ok(error instanceof SampleFormatError);
    assert.equal(error.line, 2);
    return /not a finite number/.test(error.message);
  });
});

test('rejects empty input and an empty JSON array', () => {
  assert.throws(() => parseSamples('   '), /input is empty/);
  assert.throws(() => parseSamples('[]'), /array is empty/);
});

test('rejects malformed JSON with the parser message', () => {
  assert.throws(() => parseSamples('[1, 2,'), /invalid JSON/);
});

test('rejects objects with no numeric field', () => {
  assert.throws(() => parseSamples('[{"a": "x"}]'), /no numeric field/);
});
