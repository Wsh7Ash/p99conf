# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-11-22

### Added

- `analyze`: nearest-rank percentiles with distribution-free order-statistic
  confidence intervals, reported coverage, and a max-observation bound.
- `analyze --threshold`: pass/fail/undecided verdict with exit codes 0/1/2.
- Exceedance counts with a Wilson score interval.
- `plan`: one-sided sample requirement plus a two-sided interval plan at a
  chosen rank fraction.
- `shards`: bounds for a percentile merged from per-shard summaries, with the
  invalid average explicitly labelled.
- Parsers for JSON arrays, JSON objects, JSON Lines, CSV/TSV and plain text.
- JSON output, deterministic fixtures, a subprocess demo harness and a CI
  workflow that asserts the documented behaviour.
