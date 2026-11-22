import { binomCdf } from './stats.ts';

export type PlanReport = {
  percentile: number;
  confidence: number;
  /** Target interval width as a fraction of the sample ranks. */
  maxRankFraction: number | null;
  minSamplesForUpperBound: number;
  minSamplesForInterval: number | null;
  rankWindowAtInterval: number | null;
  notes: string[];
};

/**
 * Smallest n such that P(at least one observation exceeds the population
 * p-quantile) >= confidence. This is the number of samples needed before the
 * maximum is a defensible one-sided upper bound.
 */
export function minSamplesForUpperBound(p: number, confidence: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('confidence must be in (0, 1)');
  const n = Math.ceil(Math.log(1 - confidence) / Math.log(p));
  return Math.max(1, n);
}

function quantileIndex(n: number, p: number, target: number): number | null {
  if (binomCdf(n - 1, n, p) < target) return null;
  let low = 1;
  let high = n;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (binomCdf(mid - 1, n, p) >= target) high = mid;
    else low = mid + 1;
  }
  return low;
}

function rankWidth(n: number, p: number, alpha: number): number | null {
  const lowerRank = quantileIndex(n, p, alpha / 2);
  const upperRank = quantileIndex(n, p, 1 - alpha / 2);
  if (lowerRank === null || upperRank === null) return null;
  return upperRank - lowerRank + 1;
}

/**
 * Smallest n for a two-sided interval whose two endpoints span at most
 * maxRankFraction of the sample ranks. Rank width grows like
 * 2*z*sqrt(n*p*(1-p)), so the fraction of the sample it covers shrinks as n
 * grows; that makes it a meaningful planning target (unlike an absolute count
 * of order statistics, which smaller runs satisfy more easily).
 *
 * The search doubles from 1/(1-p) and then bisects. The fractional width is
 * close to, but not perfectly, monotone in n; the result is a good feasible
 * size, not a proven optimum.
 */
export function minSamplesForInterval(
  p: number,
  confidence: number,
  maxRankFraction: number,
  ceiling = 20_000_000,
): number | null {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('confidence must be in (0, 1)');
  if (!(maxRankFraction > 0 && maxRankFraction < 1)) {
    throw new RangeError(`rank fraction must be in (0, 1), got ${maxRankFraction}`);
  }
  const alpha = 1 - confidence;
  const start = Math.max(2, Math.ceil(1 / (1 - p)));

  const feasible = (n: number): boolean => {
    const width = rankWidth(n, p, alpha);
    return width !== null && width / n <= maxRankFraction;
  };

  let high = start;
  while (!feasible(high)) {
    if (high >= ceiling) return null;
    high = Math.min(high * 2, ceiling);
  }

  let low = start;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (feasible(mid)) high = mid;
    else low = mid + 1;
  }
  return high;
}

export function planReport(
  percentile: number,
  confidence: number,
  maxRankFraction: number | null = null,
): PlanReport {
  if (!(percentile > 0 && percentile <= 100)) {
    throw new RangeError(`percentile must be in (0, 100], got ${percentile}`);
  }
  const p = percentile / 100;
  const upper = minSamplesForUpperBound(p, confidence);
  const notes: string[] = [];
  notes.push(
    `${upper} samples put at least one observation above the p${percentile} quantile ` +
      `with ${Math.round(confidence * 1000) / 10}% confidence, so the maximum becomes a valid bound`,
  );

  let interval: number | null = null;
  let rankWindow: number | null = null;
  if (maxRankFraction !== null) {
    interval = minSamplesForInterval(p, confidence, maxRankFraction);
    if (interval === null) {
      notes.push(
        `no run up to the search ceiling reaches a ${maxRankFraction * 100}% rank window; ` +
          'loosen the target or accept a hundred-million-sample run',
      );
    } else {
      rankWindow = rankWidth(interval, p, 1 - confidence);
      notes.push(
        `a ${Math.round(confidence * 1000) / 10}% interval whose endpoints span at most ` +
          `${Math.round(maxRankFraction * 1000) / 10}% of the sample ranks needs ` +
          `${interval} samples (a ${rankWindow}-observation window)`,
      );
    }
  } else {
    notes.push('pass --rank-fraction to also plan a two-sided interval');
  }

  notes.push(
    'planning assumes independent, identically distributed samples from one stationary workload',
  );

  return {
    percentile,
    confidence,
    maxRankFraction,
    minSamplesForUpperBound: upper,
    minSamplesForInterval: interval,
    rankWindowAtInterval: rankWindow,
    notes,
  };
}
