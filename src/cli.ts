import { readFileSync } from 'node:fs';
import { analyze } from './analyze.ts';
import { parseSamples, SampleFormatError } from './parse.ts';
import { planReport } from './plan.ts';
import { parseShards, shardBounds, ShardFormatError } from './shards.ts';
import { renderAnalysis, renderPlan, renderShards } from './render.ts';

export const EXIT = {
  pass: 0,
  fail: 1,
  undecided: 2,
  usage: 3,
} as const;

const HELP = `p99conf - what your latency percentiles can actually support

Usage:
  p99conf analyze <file> [options]     percentiles with distribution-free intervals
  p99conf plan [options]               how many samples a bound needs
  p99conf shards <file> [options]      bounds for a percentile merged across shards

Options for analyze:
  --percentile <p>      gate percentile, in percent (default 99)
  --percentiles <list>  extra percentiles to report, comma separated (default 50,90,95,99)
  --confidence <c>      interval confidence in (0,1) (default 0.95)
  --threshold <value>   latency SLO; exit 0 pass, 1 fail, 2 undecided
  --field <name>        numeric field or CSV column to read
  --unit <label>        display unit (default ms; pass "" for none)
  --json                machine-readable output

Options for plan:
  --percentile <p>      percentile to plan for (default 99)
  --confidence <c>      confidence in (0,1) (default 0.95)
  --rank-fraction <f>   also plan a two-sided interval whose endpoints span at most
                        this fraction of the sample ranks, e.g. 0.02
  --json                machine-readable output

Options for shards:
  --percentile <p>      percentile the shard summaries describe (default 99)
  --unit <label>        display unit (default ms)
  --json                machine-readable output

Exit codes: 0 pass, 1 fail, 2 undecided, 3 usage or input error.

The interval method makes no distributional assumption. readme section
"Method" states the coverage formula and its citation.`;

type Flags = Record<string, string | true>;

type ParsedArgs = { positional: string[]; flags: Flags };

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    if (body.includes('=')) {
      const index = body.indexOf('=');
      flags[body.slice(0, index)] = body.slice(index + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { positional, flags };
}

function numberFlag(flags: Flags, name: string, fallback: number): number {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (raw === true) throw new Error(`--${name} needs a value`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got "${raw}"`);
  return value;
}

function optionalNumber(flags: Flags, name: string): number | null {
  const raw = flags[name];
  if (raw === undefined) return null;
  if (raw === true) throw new Error(`--${name} needs a value`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got "${raw}"`);
  return value;
}

function stringFlag(flags: Flags, name: string, fallback: string): string {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (raw === true) throw new Error(`--${name} needs a value`);
  return raw;
}

function percentileList(flags: Flags): number[] {
  const raw = flags.percentiles;
  if (raw === undefined) return [50, 90, 95, 99];
  if (raw === true) throw new Error('--percentiles needs a comma separated list');
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (parts.length === 0) throw new Error('--percentiles received an empty list');
  return parts.map((part) => {
    const value = Number(part);
    if (!Number.isFinite(value)) throw new Error(`--percentiles has a non-numeric entry "${part}"`);
    return value;
  });
}

function readInput(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${path}: ${(error as Error).message}`);
  }
}

function errorCode(error: unknown): number {
  if (error instanceof SampleFormatError || error instanceof ShardFormatError) return EXIT.usage;
  if (error instanceof RangeError) return EXIT.usage;
  const message = (error as Error).message ?? String(error);
  if (/^(cannot read|--)/.test(message)) return EXIT.usage;
  return EXIT.usage;
}

function cmdAnalyze(args: ParsedArgs): number {
  const file = args.positional[0];
  if (!file) throw new Error('analyze needs a sample file');
  const text = readInput(file);
  const field = args.flags.field === undefined ? undefined : stringFlag(args.flags, 'field', '');
  const samples = parseSamples(text, field === undefined ? {} : { field });
  const confidence = numberFlag(args.flags, 'confidence', 0.95);
  const gatePercentile = numberFlag(args.flags, 'percentile', 99);
  const threshold = optionalNumber(args.flags, 'threshold');
  const unit = stringFlag(args.flags, 'unit', 'ms');

  const analysis = analyze(samples, {
    percentiles: percentileList(args.flags),
    confidence,
    threshold,
    gatePercentile,
  });

  if (args.flags.json === true) {
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderAnalysis(analysis, unit)}\n`);
  }
  return analysis.gate?.verdict?.exitCode ?? EXIT.pass;
}

function cmdPlan(args: ParsedArgs): number {
  const percentile = numberFlag(args.flags, 'percentile', 99);
  const confidence = numberFlag(args.flags, 'confidence', 0.95);
  const fraction = optionalNumber(args.flags, 'rank-fraction');
  if (fraction !== null && !(fraction > 0 && fraction < 1)) {
    throw new Error('--rank-fraction must be a fraction in (0, 1), e.g. 0.02');
  }
  const plan = planReport(percentile, confidence, fraction);
  if (args.flags.json === true) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderPlan(plan)}\n`);
  }
  return EXIT.pass;
}

function cmdShards(args: ParsedArgs): number {
  const file = args.positional[0];
  if (!file) throw new Error('shards needs a shard summary file');
  const text = readInput(file);
  const shards = parseShards(text);
  const percentile = numberFlag(args.flags, 'percentile', 99);
  const unit = stringFlag(args.flags, 'unit', 'ms');
  const bounds = shardBounds(shards, percentile);
  if (args.flags.json === true) {
    process.stdout.write(`${JSON.stringify(bounds, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderShards(bounds, unit)}\n`);
  }
  return EXIT.pass;
}

export function run(argv: string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    return EXIT.pass;
  }
  const [command, ...rest] = argv;
  try {
    const args = parseArgs(rest);
    switch (command) {
      case 'analyze':
        return cmdAnalyze(args);
      case 'plan':
        return cmdPlan(args);
      case 'shards':
        return cmdShards(args);
      default:
        process.stderr.write(`unknown command "${command}"\n\n${HELP}\n`);
        return EXIT.usage;
    }
  } catch (error) {
    process.stderr.write(`p99conf: ${(error as Error).message}\n`);
    return errorCode(error);
  }
}
