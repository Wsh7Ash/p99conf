import {
  orderStatInterval,
  percentile,
  sortSamples,
  upperBoundFromMax,
  wilson,
  type OrderStatInterval,
  type UpperBound,
} from './stats.ts';

export type PercentileReport = {
  percentile: number;
  value: number;
  lower: number | null;
  upper: number | null;
  coverage: number;
  lowerRank: number | null;
  upperRank: number | null;
  /** Max-observation upper bound and how much confidence it carries. */
  maxBound: number;
  maxBoundCoverage: number;
};

export type VerdictOutcome = 'pass' | 'fail' | 'undecided';

export type Verdict = {
  outcome: VerdictOutcome;
  exitCode: number;
  threshold: number;
  detail: string;
};

export type Exceedance = {
  threshold: number;
  over: number;
  of: number;
  estimate: number;
  lower: number;
  upper: number;
  confidence: number;
};

export type Analysis = {
  count: number;
  min: number;
  max: number;
  mean: number;
  confidence: number;
  percentiles: PercentileReport[];
  gate: { percentile: number; verdict: Verdict | null; exceedance: Exceedance | null } | null;
  resolution: {
    n: number;
    /** Lowest percentile that has at least one observation above it. */
    smallestEstimable: number;
    note: string;
  };
};

export type AnalyzeOptions = {
  percentiles?: number[];
  confidence?: number;
  threshold?: number | null;
  gatePercentile?: number;
};

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function decide(interval: OrderStatInterval, point: number, threshold: number): Verdict {
  if (interval.upper !== null && interval.upper <= threshold) {
    return {
      outcome: 'pass',
      exitCode: 0,
      threshold,
      detail:
        `upper ${Math.round(interval.coverage * 1000) / 10}% confidence bound ` +
        `${interval.upper} is at or below the threshold ${threshold}`,
    };
  }
  if (interval.lower !== null && interval.lower > threshold) {
    return {
      outcome: 'fail',
      exitCode: 1,
      threshold,
      detail:
        `lower ${Math.round(interval.coverage * 1000) / 10}% confidence bound ` +
        `${interval.lower} is above the threshold ${threshold}`,
    };
  }
  const missing = interval.upper === null
    ? `no ${Math.round(interval.coverage * 1000) / 10}% upper bound exists at n=${interval.n}: ` +
      'the sample maximum is one observation, not a bound'
    : `the interval ${interval.lower ?? 'unbounded'}..${interval.upper} straddles the threshold`;
  return {
    outcome: 'undecided',
    exitCode: 2,
    threshold,
    detail: `${missing}; the observed value ${point} cannot settle the question`,
  };
}

export function analyze(samples: number[], options: AnalyzeOptions = {}): Analysis {
  const sorted = sortSamples(samples);
  if (sorted.length === 0) throw new Error('no samples');
  const n = sorted.length;
  const confidence = options.confidence ?? 0.95;
  if (!(confidence > 0 && confidence < 1)) {
    throw new RangeError(`confidence must be in (0, 1), got ${confidence}`);
  }

  const requested = options.percentiles && options.percentiles.length > 0
    ? options.percentiles
    : [50, 90, 95, 99];
  const gatePercentile = options.gatePercentile ?? 99;
  const all = Array.from(new Set([...requested, gatePercentile])).sort((a, b) => a - b);

  for (const p of all) {
    if (!(p > 0 && p <= 100)) throw new RangeError(`percentile must be in (0, 100], got ${p}`);
  }

  const reports: PercentileReport[] = all.map((p) => {
    const fraction = p / 100;
    const interval = orderStatInterval(sorted, fraction, confidence);
    const maxBound: UpperBound = upperBoundFromMax(sorted, fraction, confidence);
    return {
      percentile: p,
      value: percentile(sorted, fraction),
      lower: interval.lower,
      upper: interval.upper,
      coverage: round(interval.coverage),
      lowerRank: interval.lowerRank,
      upperRank: interval.upperRank,
      maxBound: maxBound.upper,
      maxBoundCoverage: round(maxBound.coverage, 4),
    };
  });

  const target = reports.find((report) => report.percentile === gatePercentile)!;
  const threshold = options.threshold ?? null;
  let gate: Analysis['gate'] = null;
  if (threshold !== null) {
    if (!Number.isFinite(threshold)) throw new RangeError('threshold must be finite');
    const interval = orderStatInterval(sorted, gatePercentile / 100, confidence);
    const over = sorted.filter((value) => value > threshold).length;
    const proportion = wilson(over, n, confidence);
    gate = {
      percentile: gatePercentile,
      verdict: decide(interval, target.value, threshold),
      exceedance: {
        threshold,
        over,
        of: n,
        estimate: proportion.estimate,
        lower: proportion.lower,
        upper: proportion.upper,
        confidence,
      },
    };
  }

  const mean = round(sorted.reduce((sum, value) => sum + value, 0) / n, 6);
  const smallestEstimable = round((1 - 1 / n) * 100, 4);

  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    confidence,
    percentiles: reports,
    gate,
    resolution: {
      n,
      smallestEstimable,
      note:
        `with ${n} samples the highest percentile any observation can speak to is ` +
        `p${smallestEstimable}; above that the sample maximum is the only evidence`,
    },
  };
}
