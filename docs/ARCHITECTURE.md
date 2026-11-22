# Architecture

```
bin/p99conf.ts          executable, sets process.exitCode
src/cli.ts              argument parsing, file reads, exit-code mapping
src/analyze.ts          percentiles, verdict, exceedance, resolution
src/plan.ts             sample-size planning
src/shards.ts           per-shard summaries -> bounds
src/parse.ts            input formats -> number[]
src/stats.ts            incomplete beta, binomial CDF, intervals, Wilson
src/render.ts           text formatting
```

## Decisions

**Zero dependencies, no build.** Node 22.18+ strips TypeScript types natively, so
the shipped source is the executed source. There is no `tsc` output to drift from
the code and no install step in CI. The trade-off is that type *checking* is not
part of `npm test`; types are checked by the editor/`tsc --noEmit`, not enforced
in CI.

**Pure analysis layer.** `analyze`, `plan` and `shards` take plain data and
return plain objects. All I/O and process concerns live in `cli.ts`, which makes
the statistics testable without spawning processes.

**Coverage over nominal labels.** Rank selection is followed by a widening step
until the computed coverage reaches the requested confidence. This can widen an
interval by a rank or two, but the printed coverage never overstates the bound.

**Explicit failure states.** `EXIT.undecided = 2` exists so callers can branch on
insufficient evidence. Usage and input errors are `3`, never `1`, so a typo
cannot look like a failed SLO.

## Data flow

1. `parseArgs` separates positional paths from `--flags`.
2. `parseSamples` returns finite numbers or throws `SampleFormatError` with a
   line number.
3. `analyze` sorts once, then computes every interval from that array.
4. `render` formats; `--json` serialises the same object.
5. `run` returns the verdict's exit code.

## Error handling

- Input files: `cannot read <path>: ...` → exit 3.
- Malformed samples: message with line number → exit 3.
- Invalid flags: message naming the flag → exit 3.
- No samples: `no samples` → exit 3.

## Extension points

- `parse.ts`: add a histogram reader by emitting weighted samples.
- `plan.ts`: add `--target-margin` once a distributional assumption is explicit.
- `analyze.ts`: add multi-run pooling by accepting an array of sample sets.
