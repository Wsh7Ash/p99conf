# p99conf — Project Specification

## 1. Vision

Make it normal to attach uncertainty to a latency percentile, and to admit when
a load test cannot decide an SLO question.

## 2. Target audience

Performance engineers, SREs and backend developers who gate releases on
percentile SLOs and need an offline, scriptable second opinion on their own
load-test output.

## 3. Problem statement

A load test produces a finite sample. The p99 of that sample is one order
statistic with a sampling distribution, but most tooling prints it as a fact and
many CI gates compare it directly to a threshold. The result is a gate that
flips between green and red on identical code. The same tools offer no way to
ask "how many requests would this claim need?", and their dashboards encourage
averaging per-shard p99 values, which is not a valid estimator of the fleet p99.

## 4. Existing alternatives

| Tool | What it does | What it leaves open |
|---|---|---|
| k6 / `--summary-trend-stats` | percentiles from a run | no interval, gate on point estimate |
| wrk2 / vegeta / hey | percentile reports | no uncertainty, no planning |
| HdrHistogram | compact percentile storage | stores values, makes no inference |
| benchstat | CIs for benchmark *means* | not tail percentiles |
| hyperfine | mean CIs with warm-up handling | not percentiles |
| spreadsheets / blog posts | manual formulas | not reproducible or scriptable |

## 5. Competitive differentiation

The unit of output is an interval plus a verdict, not a number. Three states
(pass/fail/undecided) are a first-class part of the CLI contract through exit
code `2`. Sample-size planning and shard bounds are part of the same tool, so a
team can go from "our p99 is 371 ms" to "which claims does that support?" without
a statistics library.

## 6. Core functionality

1. Parse samples from JSON, JSONL, CSV/TSV and plain text.
2. Report percentiles with order-statistic confidence intervals and coverage.
3. Decide pass/fail/undecided against a threshold.
4. Report exceedance with a Wilson interval.
5. Plan sample sizes for one-sided and two-sided claims.
6. Bound a percentile merged from per-shard summaries.

## 7. Technical architecture

```
parse.ts -> analyze.ts -> render.ts -> cli.ts
             ^   ^
       stats.ts  plan.ts, shards.ts
```

`stats.ts` holds the numerical core (regularized incomplete beta, binomial CDF,
order statistics, Wilson interval, normal quantile). `analyze.ts`, `plan.ts` and
`shards.ts` are pure functions over data. `cli.ts` only parses arguments, reads
files and maps outcomes to exit codes. No module performs I/O except the CLI.

## 8. Main components

- `src/stats.ts` — distribution functions and intervals.
- `src/parse.ts` — sample formats and validation.
- `src/analyze.ts` — reports, verdict, exceedance.
- `src/plan.ts` — sample-size planning.
- `src/shards.ts` — shard merge bounds.
- `src/render.ts` — text output.
- `src/cli.ts` — command dispatch and exit codes.

## 9. Data flow

File → `parseSamples` → sorted finite numbers → `analyze` (percentiles,
intervals, optional verdict) → `render` or JSON → exit code.

## 10. Dependencies

Node.js standard library only. TypeScript syntax is erased by Node; there is no
build step and no `node_modules`. Tests use `node:test`.

## 11. Security considerations

Read-only local files; no network, no subprocess execution, no credentials, no
telemetry. Inputs are validated for finiteness; a malformed file is a usage
error rather than a crash. No sample data is written anywhere except stdout.

## 12. User workflows

- **Gate inspection:** run with `--threshold` and inspect the verdict and
  interval before trusting a red build.
- **Run planning:** call `plan` for the percentile and confidence the SLO needs.
- **Dashboard audit:** feed shard summaries to `shards` and compare the reported
  fleet p99 with the bound.
- **Machine consumption:** `--json` for a report artefact.

## 13. Testing strategy

- Known-value tests for the numerical functions (binomial CDF, incomplete beta,
  normal quantile).
- Property tests: intervals bracket the point estimate, coverage is never below
  the requested confidence, narrower tolerances need more samples.
- Format tests for every accepted input shape and every rejection path.
- CLI integration tests asserting stdout and exit codes `0/1/2/3`.
- Demo harness re-running every documented command and recording observed exit
  codes.

## 14. Definition of done

- [x] Primary workflow works from a clean checkout with no install.
- [x] All documented commands produce the documented exit codes.
- [x] Tests cover statistics, parsing, verdicts and CLI behaviour.
- [x] Every claim in the README is backed by `results/demo.txt`.
- [x] CI runs the suite and asserts the demo outcomes.

## 15. Known limitations

Nearest-rank percentiles; i.i.d. and stationary-workload assumption; no
histogram input; no warm-up handling; shard bounds are sound but loose; unit is
display-only; no multi-run pooling.

## 16. Future development

Histogram merge, automatic warm-up trimming, bootstrap intervals for
autocorrelated traces, multi-run hierarchical pooling, and a `--compare` mode
that tests whether two runs differ beyond sampling noise.
