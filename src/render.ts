import type { Analysis } from './analyze.ts';
import type { PlanReport } from './plan.ts';
import type { ShardBounds } from './shards.ts';

const many = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
};

const percent = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`;

function column(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function right(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

export function renderAnalysis(analysis: Analysis, unit = 'ms'): string {
  const lines: string[] = [];
  const suffix = unit === '' ? '' : ` ${unit}`;
  lines.push('p99conf - percentile evidence');
  lines.push('');
  lines.push(`samples    ${analysis.count}`);
  lines.push(`range      ${many(analysis.min)} .. ${many(analysis.max)}${suffix}`);
  lines.push(`mean       ${many(analysis.mean)}${suffix}`);
  lines.push(`confidence ${Math.round(analysis.confidence * 1000) / 10}%`);
  lines.push('');
  lines.push(
    column('percentile', 12) +
      right('value', 12) +
      '  ' +
      column('interval', 30) +
      right('coverage', 10),
  );
  for (const report of analysis.percentiles) {
    const interval = report.lower === null
      ? `unbounded .. ${many(report.upper ?? report.maxBound)}`
      : report.upper === null
        ? `${many(report.lower)} .. unbounded`
        : `${many(report.lower)} .. ${many(report.upper)}`;
    lines.push(
      column(`p${report.percentile}`, 12) +
        right(many(report.value), 12) +
        '  ' +
        column(interval, 30) +
        right(percent(report.coverage), 10),
    );
  }
  lines.push('');

  if (analysis.gate?.verdict) {
    const verdict = analysis.gate.verdict;
    lines.push(`verdict    ${verdict.outcome.toUpperCase()}  threshold ${many(verdict.threshold)}${suffix}`);
    lines.push(`           ${verdict.detail}`);
    if (analysis.gate.exceedance) {
      const ex = analysis.gate.exceedance;
      lines.push(
        `exceedance ${ex.over} of ${ex.of} samples above the threshold ` +
          `(${percent(ex.estimate)}, ${Math.round(ex.confidence * 100)}% CI ` +
          `${percent(ex.lower)}..${percent(ex.upper)})`,
      );
    }
    lines.push('');
  }

  const gateReport = analysis.percentiles.find(
    (item) => item.percentile === (analysis.gate?.percentile ?? analysis.percentiles.at(-1)?.percentile),
  );
  if (gateReport && gateReport.maxBoundCoverage < analysis.confidence) {
    lines.push(
      `thin data  the maximum (${many(gateReport.maxBound)}) is only a ` +
        `${percent(gateReport.maxBoundCoverage, 1)} upper bound at p${gateReport.percentile}`,
    );
  }
  lines.push(`resolution ${analysis.resolution.note}`);
  lines.push(
    'method     order-statistic bounds; no distributional assumption, so wide intervals ' +
      'mean the data is thin, not that the method failed',
  );
  return lines.join('\n');
}

export function renderPlan(plan: PlanReport): string {
  const lines: string[] = [];
  lines.push('p99conf - sample-size plan');
  lines.push('');
  lines.push(`percentile            p${plan.percentile}`);
  lines.push(`confidence            ${Math.round(plan.confidence * 1000) / 10}%`);
  lines.push(`upper-bound samples   ${plan.minSamplesForUpperBound}`);
  if (plan.minSamplesForInterval !== null) {
    lines.push(`interval samples      ${plan.minSamplesForInterval}`);
    lines.push(
      `rank window           ${plan.rankWindowAtInterval} observations ` +
        `(${Math.round((plan.maxRankFraction ?? 0) * 1000) / 10}% of the run)`,
    );
  }
  lines.push('');
  for (const note of plan.notes) lines.push(`note  ${note}`);
  return lines.join('\n');
}

export function renderShards(bounds: ShardBounds, unit = 'ms'): string {
  const suffix = unit === '' ? '' : ` ${unit}`;
  const lines: string[] = [];
  lines.push('p99conf - merged percentile bounds');
  lines.push('');
  lines.push(`shards          ${bounds.totalCount} samples total`);
  lines.push(`largest shard   ${percent(bounds.largestShare, 1)} of traffic`);
  lines.push(`merged p${bounds.percentile}      ${many(bounds.lower)} .. ${many(bounds.upper)}${suffix}`);
  lines.push(`average of p's  ${many(bounds.meanOfShardPercentiles)}${suffix}  (not a valid merge)`);
  lines.push(`weighted mean   ${many(bounds.weightedMean)}${suffix}  (not a valid merge)`);
  lines.push('');
  lines.push(`note  ${bounds.note}`);
  return lines.join('\n');
}
