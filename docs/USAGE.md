# Usage

## Analyze

```bash
p99conf analyze <file> [--percentile 99] [--percentiles 50,90,95,99] \
  [--confidence 0.95] [--threshold 250] [--field latency_ms] [--unit ms] [--json]
```

- `--percentile` is the gate target and is always shown.
- `--percentiles` adds display percentiles; the union is sorted and deduplicated.
- `--threshold` switches on the verdict and the exit code.
- `--field` selects a JSON object key or CSV column.
- `--unit` is a display label only; nothing is converted.

Accepted inputs:

| Shape | Example | Field selection |
|---|---|---|
| JSON array of numbers | `[12.5, 9, 31]` | n/a |
| JSON array of objects | `[{"latency_ms": 12}]` | `--field latency_ms`, else first numeric key |
| JSON Lines of objects | `{"ms": 12}\n{"ms": 9}` | same |
| CSV/TSV with header | `time,status,latency_ms` | `--field`, else latency/duration/ms/value/time heuristic |
| Plain text | `12.5\n9\n31` | one value per line, `#` comments skipped |

## Plan

```bash
p99conf plan [--percentile 99] [--confidence 0.95] [--rank-fraction 0.02] [--json]
```

- The one-sided sample count is `ceil(ln(1-C)/ln(p))`: 299 for p99 at 95%.
- `--rank-fraction` also plans a two-sided interval whose endpoints span at most
  that fraction of the sample ranks. Smaller values mean more samples.

## Shards

```bash
p99conf shards <file> [--percentile 99] [--unit ms] [--json]
```

Input is a JSON array of `{"name", "count", "percentile"}` objects, or CSV with
`name,count,percentile`. The merged percentile is bounded by the smallest and
largest shard percentile; the average and the count-weighted mean are printed
only to be labelled invalid.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | pass, or analysis completed with no threshold |
| 1 | fail — the bound is above the threshold |
| 2 | undecided — the interval cannot place the percentile relative to the threshold |
| 3 | usage error, unreadable file, or malformed input |

## Examples

```bash
# inspect a 1,200-sample run against a 500 ms SLO
p99conf analyze fixtures/checkout-latency.json --threshold 500

# prove the run is too small to decide
p99conf analyze fixtures/small-sample.txt --percentile 99 --threshold 1000; echo $?  # 2

# plan a run before spending the time
p99conf plan --percentile 99 --rank-fraction 0.02

# audit a fleet p99 built from shard summaries
p99conf shards fixtures/shards.json --percentile 99
```

## Reproducing the fixtures

```bash
npm run fixtures   # seed 20261122, deterministic
npm run demo       # reruns every documented command into results/
```
