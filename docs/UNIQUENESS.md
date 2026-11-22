# p99conf — Uniqueness

## Closest existing alternatives

| Alternative | Purpose | Mechanism |
|---|---|---|
| k6 `--summary-trend-stats` | percentile summary for a run | streaming point estimates |
| wrk2 | constant-throughput latency report | corrected latency histogram |
| vegeta / hey | load generation and reports | histogram quantiles |
| HdrHistogram | percentile storage | fixed-bucket counters |
| benchstat | compare Go benchmarks | t-intervals on means |
| hyperfine | benchmark timing | mean CIs, warm-up |
| Google SRE workbook | alerting on SLOs | burn-rate arithmetic, no sampling inference |

Research method: web search for percentile confidence tooling on 2026-11-22,
plus a check of this workspace's 219 previous projects (no latency-statistics
tool existed; `ratelab` and `rampwatch` generate load and report percentiles).

## Similarities with existing projects

- Reads the same kind of latency samples as any load-testing tool.
- Reports the same familiar percentiles (p50/p90/p95/p99).

## Meaningful differences

1. **Interval first.** The primary output is a bound with a reported coverage,
   not a point estimate. `benchstat` and `hyperfine` do this for means, not for
   high percentiles.
2. **Three-way gate.** `UNDECIDED` is a distinct exit code, so CI can treat
   "not enough evidence" as its own state instead of silently passing.
3. **Planning in the same binary.** `plan` answers "how many samples?" from the
   same binomial machinery that produces the interval.
4. **Merge bounds.** `shards` gives the interval the true fleet percentile must
   fall in and labels the common average-of-percentiles as invalid.
5. **Honest thin data.** With few samples the report says the maximum carries
   only 33% confidence, and the verdict is undecided rather than green.

## Unique mechanism

Order-statistic confidence intervals (exact binomial coverage, no distributional
assumption) combined with a three-state SLO verdict and sample-size planning in a
zero-dependency CLI.

## Why this deserves an independent repository

It answers a question none of the surveyed tools answer — "does this load test
support the SLO claim?" — and it is usable offline in any CI job without adding a
statistics dependency. It is also independent of load generator, so it can audit
output from k6, vegeta, Locust or a custom harness.

## Remaining originality uncertainties

- Statistical interval construction is textbook material (Hahn & Meeker, NIST);
  the originality is in the tool's contract, not in new mathematics.
- A vendor could add intervals to a load tester; the shard-merge bound and the
  three-state verdict are the parts least likely to appear as a checkbox.
- "p99" naming is crowded, which is why the README states the mechanism plainly
  instead of claiming a novel estimator.
