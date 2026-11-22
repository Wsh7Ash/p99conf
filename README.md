# p99conf

**What your latency percentiles can actually support.**

`p99conf` reads a latency sample file and reports each percentile with a
distribution-free confidence interval. When you give it an SLO it answers
`PASS`, `FAIL` or **`UNDECIDED`** — and `UNDECIDED` is the answer most
load-test gates should have given.

Point estimates are not evidence. A p99 taken from 200 requests is a single
order statistic; a gate that compares it to an SLO threshold cannot tell a
regression from sampling noise. `p99conf` reports the interval instead, plans
the sample size a bound needs, and refuses to average per-shard percentiles.

```console
$ p99conf analyze fixtures/checkout-latency.json --threshold 500
p99conf - percentile evidence

samples    1200
range      33.5 .. 498.3 ms
mean       152.365 ms
confidence 95%

percentile         value  interval                        coverage
p50                140.7  136.7 .. 144.6                    95.03%
p90                240.4  228.7 .. 251.4                    95.17%
p95                  282  270.3 .. 295.8                    95.33%
p99                  371  349.1 .. 433.2                    95.94%

verdict    PASS  threshold 500 ms
           upper 95.9% confidence bound 433.2 is at or below the threshold 500
exceedance 0 of 1200 samples above the threshold (0.00%, 95% CI 0.00%..0.32%)

resolution with 1200 samples the highest percentile any observation can speak to is p99.9167; above that the sample maximum is the only evidence
method     order-statistic bounds; no distributional assumption, so wide intervals mean the data is thin, not that the method failed
```

With 40 samples the same SLO is not decidable, and `p99conf` says so instead of
printing a green check:

```console
verdict    UNDECIDED  threshold 1000 ms
           no 99.2% upper bound exists at n=40: the sample maximum is one observation, not a bound; ...
(exit 2)
```

## Why it exists

- Load-test tools (`k6`, `wrk2`, `vegeta`, `hey`) report percentiles as point
  estimates and gate on them.
- `benchstat` and `hyperfine` compute confidence intervals for *means*, not for
  a p99 order statistic.
- HdrHistogram stores percentiles but makes no claim about their uncertainty.
- Averaging p99 values across shards is a common and invalid way to compute a
  fleet p99. `p99conf shards` reports the bounds the true value must lie in.

## Features

1. `analyze` — percated percentiles with exact order-statistic intervals,
   coverage, and a max-observation bound with its true confidence.
2. `--threshold` — three-way SLO verdict with exit codes: `0` pass, `1` fail,
   `2` undecided.
3. `plan` — how many samples a one-sided bound needs (`299` for p99 at 95%), and
   how many a two-sided interval needs at a chosen rank width.
4. `shards` — bounds for a percentile merged from per-shard summaries, plus the
   invalid average labelled as invalid.
5. Exceedance evidence — how many samples broke the threshold, with a Wilson
   interval, so "no failures observed" is never over-read.

Input formats: a JSON array of numbers, a JSON array of objects, JSON Lines, CSV
or TSV with a header, or one number per line. Comments (`#`) are ignored.

## Requirements

Node.js **22.18 or newer** (the CLI is TypeScript run through Node's built-in
type stripping). No dependencies, no build step, no install.

## Quick start

```bash
git clone https://github.com/Wsh7Ash/p99conf
cd p99conf
node bin/p99conf.ts analyze fixtures/checkout-latency.json --threshold 500
```

Optional shim: `npm link` makes `p99conf` available on `PATH`.

## Usage

```bash
# percentiles with intervals, machine-readable
node bin/p99conf.ts analyze results.json --percentile 99 --json

# pick a column out of CSV/JSON objects
node bin/p99conf.ts analyze run.csv --field latency_ms --unit ms

# SLO gate in CI
node bin/p99conf.ts analyze run.json --threshold 250 || echo "not proven"

# how big does the run have to be?
node bin/p99conf.ts plan --percentile 99 --confidence 0.95 --rank-fraction 0.02

# per-shard summaries
node bin/p99conf.ts shards fixtures/shards.json --percentile 99
```

Exit codes: `0` pass, `1` fail, `2` undecided, `3` usage or input error. Treat
`2` as "collect more data or accept the risk" rather than as a pass.

## Method

For `n` sorted samples and a population quantile `ξ_p`, the interval
`[x_(r), x_(s)]` covers `ξ_p` with probability

```
I_p(r, n-r+1) - I_p(s, n-s+1)
```

which is exact for any continuous latency distribution and does not depend on
its shape (Hahn & Meeker, *Statistical Intervals*, 1991, ch. 5;
NIST/SEMATECH e-Handbook 7.2.6.1). Ranks are chosen from the binomial
distribution, then widened by one rank where needed so the reported coverage is
never below the requested confidence.

The one-sided sample requirement follows from `P(max > ξ_p) = 1 - p^n`.

## Testing

```bash
npm test             # 62 tests, node:test
npm run demo         # runs every documented command, records results/demo.txt
```

`results/demo.txt` and `results/gate.txt` are generated by real subprocess runs;
`results/gate.txt` records each expected and observed exit code.

## Limitations

- Samples are assumed independent and identically distributed within one
  stationary workload. Coordinated omission, warm-up and diurnal drift all break
  that assumption; trim warm-up before analysis.
- Intervals are in latency units derived from observed order statistics, not a
  distributional extrapolation. You cannot get a bound for a percentile the run
  never reached; `resolution` says where that line is.
- Percentiles use nearest rank. Other tools interpolate, so values can differ by
  a sample or two.
- `shards` needs per-shard counts and quantiles. The bound is sound but loose by
  construction: it cannot know how the shards' tails overlap.
- No histogram input, no bootstrap, no multi-run pooling. A `--warmup`,
  histogram merge and bootstrap mode are natural next steps.
- The unit is display-only; `p99conf` never converts units.

Not affiliated with any load-testing vendor. No network access at runtime.

## License

MIT.
