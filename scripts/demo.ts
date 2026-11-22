/**
 * Runs every documented command as a real subprocess and records stdout,
 * stderr and the observed exit code. results/demo.txt and results/gate.txt are
 * generated here, never hand-written. Exits non-zero if an outcome drifts.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(root, 'bin', 'p99conf.ts');

const cases = [
  {
    label: 'analyze fixtures/checkout-latency.json --threshold 500',
    args: ['analyze', 'fixtures/checkout-latency.json', '--threshold', '500'],
    expect: 0,
  },
  {
    label: 'analyze fixtures/checkout-latency.json --threshold 200',
    args: ['analyze', 'fixtures/checkout-latency.json', '--threshold', '200'],
    expect: 1,
  },
  {
    label: 'analyze fixtures/small-sample.txt --percentile 99 --threshold 1000',
    args: ['analyze', 'fixtures/small-sample.txt', '--percentile', '99', '--threshold', '1000'],
    expect: 2,
  },
  {
    label: 'plan --percentile 99 --confidence 0.95 --rank-fraction 0.02',
    args: ['plan', '--percentile', '99', '--confidence', '0.95', '--rank-fraction', '0.02'],
    expect: 0,
  },
  {
    label: 'shards fixtures/shards.json --percentile 99',
    args: ['shards', 'fixtures/shards.json', '--percentile', '99'],
    expect: 0,
  },
];

mkdirSync(join(root, 'results'), { recursive: true });

let text = 'p99conf demo - every command below is a real subprocess run\n\n';
const gateLines = [];
let failed = false;

for (const item of cases) {
  const result = spawnSync(process.execPath, [bin, ...item.args], {
    cwd: root,
    encoding: 'utf8',
  });
  const status = result.status;
  text += `$ p99conf ${item.label}\n`;
  text += result.stdout;
  if (result.stderr) text += result.stderr;
  text += `(exit ${status})\n\n`;
  const ok = status === item.expect;
  if (!ok) failed = true;
  gateLines.push(`${ok ? 'OK  ' : 'DRIFT'} ${item.label}  expected=${item.expect} actual=${status}`);
}

writeFileSync(join(root, 'results', 'demo.txt'), text);
writeFileSync(
  join(root, 'results', 'gate.txt'),
  `${gateLines.join('\n')}\n\nall documented exit codes match: ${!failed}\n`,
);

console.log(gateLines.join('\n'));
console.log(`all documented exit codes match: ${!failed}`);
if (failed) process.exitCode = 1;
