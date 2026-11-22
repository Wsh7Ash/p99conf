/**
 * Merging percentile summaries. Averaging per-shard p99 values is not a valid
 * way to get the fleet p99, but the true value is bounded: if every shard has
 * at most (1-p) of its own samples above its p-quantile, the union has at most
 * (1-p) above the largest shard quantile, and at least (1-p) above the
 * smallest. This module reports that bound and the averaging mistake.
 */

export type ShardInput = { name: string; count: number; percentile: number };

export type ShardBounds = {
  percentile: number;
  lower: number;
  upper: number;
  /** The invalid number people usually report. */
  meanOfShardPercentiles: number;
  weightedMean: number;
  totalCount: number;
  largestShare: number;
  exact: boolean;
  note: string;
};

export class ShardFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShardFormatError';
  }
}

export function shardBounds(shards: ShardInput[], p: number): ShardBounds {
  if (!Array.isArray(shards) || shards.length === 0) throw new ShardFormatError('no shards given');
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile must be in (0, 100], got ${p}`);
  for (const shard of shards) {
    if (!Number.isFinite(shard.count) || shard.count <= 0) {
      throw new ShardFormatError(`shard ${shard.name} has a non-positive count`);
    }
    if (!Number.isFinite(shard.percentile)) {
      throw new ShardFormatError(`shard ${shard.name} has a non-finite percentile`);
    }
  }
  const totalCount = shards.reduce((sum, shard) => sum + shard.count, 0);
  const values = shards.map((shard) => shard.percentile);
  const lower = Math.min(...values);
  const upper = Math.max(...values);
  const meanOfShardPercentiles =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const weightedMean =
    shards.reduce((sum, shard) => sum + shard.count * shard.percentile, 0) / totalCount;
  const largestShare = Math.max(...shards.map((shard) => shard.count / totalCount));
  const exact = lower === upper;
  const rounded = (value: number): number => Math.round(value * 1000) / 1000;

  return {
    percentile: p,
    lower,
    upper,
    meanOfShardPercentiles: rounded(meanOfShardPercentiles),
    weightedMean: rounded(weightedMean),
    totalCount,
    largestShare: rounded(largestShare),
    exact,
    note: exact
      ? `every shard reports p${p} = ${lower}, so the merged p${p} is exactly that value`
      : `the merged p${p} lies between ${lower} and ${upper}; the average of shard ` +
        `percentiles (${rounded(meanOfShardPercentiles)}) and the count-weighted mean ` +
        `(${rounded(weightedMean)}) are not bounds and may be outside the true value`,
  };
}

/** Parse a shard summary file: JSON array or CSV with name,count,percentile. */
export function parseShards(text: string): ShardInput[] {
  const trimmed = text.trim();
  if (trimmed === '') throw new ShardFormatError('input is empty');

  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new ShardFormatError(`invalid JSON: ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new ShardFormatError('JSON root must be a non-empty array');
    }
    return parsed.map((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new ShardFormatError(`item ${index} is not an object`);
      }
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' && record.name.trim() !== ''
        ? record.name.trim()
        : `shard-${index + 1}`;
      const count = Number(record.count);
      const p = Number(record.percentile ?? record.p99 ?? record.value);
      if (!Number.isFinite(count) || !Number.isFinite(p)) {
        throw new ShardFormatError(`item ${index} needs numeric count and percentile`);
      }
      if (count <= 0) throw new ShardFormatError(`item ${index} has a non-positive count`);
      return { name, count, percentile: p };
    });
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].split(',').map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.includes('count') && header.some((cell) => cell.startsWith('percentile'));
  const rows = hasHeader ? lines.slice(1) : lines;
  const countIndex = hasHeader ? header.indexOf('count') : 1;
  const percentileIndex = hasHeader
    ? header.findIndex((cell) => cell.startsWith('percentile'))
    : 2;
  const nameIndex = hasHeader ? header.indexOf('name') : 0;

  return rows.map((line, offset) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const count = Number(cells[countIndex]);
    const p = Number(cells[percentileIndex]);
    if (!Number.isFinite(count) || !Number.isFinite(p)) {
      throw new ShardFormatError(`row ${offset + (hasHeader ? 2 : 1)} needs numeric count and percentile`);
    }
    if (count <= 0) {
      throw new ShardFormatError(`row ${offset + (hasHeader ? 2 : 1)} has a non-positive count`);
    }
    const name = nameIndex >= 0 && cells[nameIndex] ? cells[nameIndex] : `shard-${offset + 1}`;
    return { name, count, percentile: p };
  });
}
