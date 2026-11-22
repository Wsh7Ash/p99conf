# Contributing

## Setup

Node.js 22.18 or newer. There is nothing to install.

```bash
node --test test/stats.test.ts test/parse.test.ts test/analyze.test.ts test/plan.test.ts test/shards.test.ts test/cli.test.ts
```

## Expectations

- Keep the runtime dependency-free. A new dependency needs a justification in the
  pull request.
- Statistical changes need a test that states the property being relied on
  (coverage, monotonicity, a known value) and a citation if it is a standard
  method.
- Never make a bound look stronger than it is. Reporting `undecided` is a
  correct outcome.
- Update `results/` by rerunning `npm run demo` rather than editing captured
  output by hand.

## Reporting a bug

Include the command, the sample shape (not the sensitive data), the output and
the exit code. If the issue is statistical, state the expected behaviour and the
reference you are using.
