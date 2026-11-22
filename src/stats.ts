/**
 * Distribution-free statistics for latency percentiles.
 *
 * The interval this module builds is an order-statistic confidence interval:
 * with n sorted samples, [x_(r), x_(s)] covers the population p-quantile with
 * probability I_p(r, n-r+1) - I_p(s, n-s+1), which does not depend on the
 * shape of the latency distribution. See Hahn & Meeker, "Statistical
 * Intervals" (1991) ch. 5, and NIST/SEMATECH e-Handbook 7.2.6.1.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Log of the gamma function (Lanczos approximation). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  let z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 400;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(X <= k) for X ~ Binomial(n, p). */
export function binomCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return ibeta(n - k, k + 1, 1 - p);
}

/** Sort a copy of the samples, rejecting non-finite values. */
export function sortSamples(samples: number[]): number[] {
  if (!Array.isArray(samples)) throw new TypeError('samples must be an array');
  const copy = samples.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`sample at index ${index} is not a finite number`);
    }
    return value;
  });
  copy.sort((a, b) => a - b);
  return copy;
}

/** Nearest-rank percentile on an ascending array: the ceil(p*n)th value. */
export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) throw new Error('no samples');
  if (!Number.isFinite(p) || p <= 0 || p > 1) {
    throw new RangeError(`percentile must be in (0, 1], got ${p}`);
  }
  const rank = Math.ceil(p * sortedAscending.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedAscending.length - 1);
  return sortedAscending[index];
}

export type OrderStatInterval = {
  /** Smallest order statistic whose rank can serve as a lower bound, or null. */
  lowerRank: number | null;
  upperRank: number | null;
  lower: number | null;
  upper: number | null;
  /** Probability that the interval covers the population quantile. */
  coverage: number;
  alpha: number;
  n: number;
  percentile: number;
};

/**
 * Two-sided distribution-free confidence interval for the population quantile.
 *
 * Ranks are chosen so that at most alpha/2 of the probability mass sits in each
 * tail. When no rank satisfies the lower tail requirement (small n, extreme p)
 * the lower endpoint is reported as null instead of inventing a number.
 */
export function orderStatInterval(
  sortedAscending: number[],
  p: number,
  confidence = 0.95,
): OrderStatInterval {
  const n = sortedAscending.length;
  if (n === 0) throw new Error('no samples');
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError(`confidence must be in (0, 1), got ${confidence}`);
  }
  const alpha = 1 - confidence;
  const halfTail = alpha / 2;

  let lowerRank: number | null = null;
  let upperRank: number | null = null;
  let cumulative = 0;
  for (let k = 1; k <= n; k += 1) {
    cumulative = binomCdf(k - 1, n, p);
    if (lowerRank === null && cumulative >= halfTail) lowerRank = k;
    if (upperRank === null && cumulative >= 1 - halfTail) upperRank = k;
    if (lowerRank !== null && upperRank !== null) break;
  }

  const mass = (rank: number | null): number =>
    rank === null ? 0 : binomCdf(rank - 1, n, p);
  let coverage =
    (upperRank === null ? 1 : mass(upperRank)) - mass(lowerRank);

  // The chosen ranks can land a fraction below the nominal level because the
  // binomial is discrete. Widen by one rank at a time until the reported
  // coverage actually reaches the requested confidence; never report a bound
  // that is weaker than it claims to be.
  while (coverage < confidence && (lowerRank === null || lowerRank > 1 || (upperRank !== null && upperRank < n))) {
    if (lowerRank === null || lowerRank > 1) {
      lowerRank = lowerRank === null ? 1 : lowerRank - 1;
    } else if (upperRank !== null && upperRank < n) {
      upperRank += 1;
    } else {
      break;
    }
    coverage = (upperRank === null ? 1 : mass(upperRank)) - mass(lowerRank);
  }

  return {
    lowerRank,
    upperRank,
    lower: lowerRank === null ? null : sortedAscending[lowerRank - 1],
    upper: upperRank === null ? null : sortedAscending[upperRank - 1],
    coverage,
    alpha,
    n,
    percentile: p,
  };
}

export type UpperBound = {
  upper: number;
  coverage: number;
  n: number;
  adequate: boolean;
};

/**
 * One-sided upper bound from the maximum observation. P(max > quantile) is
 * 1 - p^n, so with few samples the maximum is a weak bound but still a valid
 * one, and the reported coverage says exactly how weak.
 */
export function upperBoundFromMax(
  sortedAscending: number[],
  p: number,
  confidence = 0.95,
): UpperBound {
  const n = sortedAscending.length;
  if (n === 0) throw new Error('no samples');
  const coverage = 1 - Math.pow(p, n);
  return {
    upper: sortedAscending[n - 1],
    coverage,
    n,
    adequate: coverage >= confidence,
  };
}

export type ProportionInterval = { estimate: number; lower: number; upper: number; n: number };

/** Wilson score interval for a binomial proportion (better than normal at 0). */
export function wilson(successes: number, n: number, confidence = 0.95): ProportionInterval {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('n must be a positive integer');
  if (successes < 0 || successes > n) throw new RangeError('successes must be within [0, n]');
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const phat = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const spread = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return {
    estimate: phat,
    lower: Math.max(0, (centre - spread) / denom),
    upper: Math.min(1, (centre + spread) / denom),
    n,
  };
}

/** Inverse standard normal CDF via Acklam's rational approximation. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
