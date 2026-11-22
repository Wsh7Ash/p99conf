/**
 * Sample loading. Accepts the shapes people actually save load-test output in:
 * a JSON array of numbers, a JSON array of objects, JSON Lines, a delimited
 * file with a header, or one number per line.
 */

export type ParseOptions = { field?: string };

export class SampleFormatError extends Error {
  readonly line: number | null;
  constructor(message: string, line: number | null = null) {
    super(line === null ? message : `${message} (line ${line})`);
    this.name = 'SampleFormatError';
    this.line = line;
  }
}

function toNumber(value: unknown, where: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new SampleFormatError(`${where} is not a finite number: ${JSON.stringify(value)}`);
}

function numericKeys(object: Record<string, unknown>): string[] {
  return Object.keys(object).filter((key) => {
    const value = object[key];
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value));
    return false;
  });
}

function pickField(
  object: Record<string, unknown>,
  field: string | undefined,
  where: string,
): number {
  if (field !== undefined) {
    if (!(field in object)) {
      throw new SampleFormatError(`${where} has no field "${field}"`);
    }
    return toNumber(object[field], `${where}.${field}`);
  }
  const keys = numericKeys(object);
  if (keys.length === 0) throw new SampleFormatError(`${where} has no numeric field`);
  return toNumber(object[keys[0]], `${where}.${keys[0]}`);
}

/**
 * Choose the measurement column. "timestamp" must not win by matching "time",
 * so latency-shaped names are tried before generic clock names.
 */
function pickColumn(names: string[]): number {
  const priorities = [
    /latency/i,
    /duration/i,
    /(^|[^a-z])ms($|[^a-z])/i,
    /millis/i,
    /value/i,
    /time/i,
  ];
  for (const pattern of priorities) {
    const found = names.findIndex((name) => pattern.test(name));
    if (found !== -1) return found;
  }
  return 0;
}

function splitDelimited(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(separator);
}

function parseDelimited(lines: string[], field: string | undefined): number[] {
  const first = splitDelimited(lines[0]);
  const header = first.some((cell) => {
    const trimmed = cell.trim();
    return trimmed !== '' && !Number.isFinite(Number(trimmed));
  });

  let index = 0;
  let body = lines;
  if (header) {
    const names = first.map((cell) => cell.trim());
    if (field !== undefined) {
      index = names.indexOf(field);
      if (index === -1) {
        throw new SampleFormatError(`header has no column "${field}": ${names.join(', ')}`);
      }
    } else {
      index = pickColumn(names);
    }
    body = lines.slice(1);
  }

  const values: number[] = [];
  body.forEach((line, offset) => {
    const lineNumber = offset + (header ? 2 : 1);
    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    const cells = splitDelimited(line);
    if (index >= cells.length) {
      throw new SampleFormatError(`expected at least ${index + 1} columns`, lineNumber);
    }
    const raw = cells[index].trim();
    if (raw === '') throw new SampleFormatError('empty value', lineNumber);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new SampleFormatError(`not a finite number: ${JSON.stringify(raw)}`, lineNumber);
    }
    values.push(parsed);
  });
  return values;
}

/** Parse sample text into a plain array of finite numbers. */
export function parseSamples(text: string, options: ParseOptions = {}): number[] {
  if (typeof text !== 'string') throw new TypeError('sample text must be a string');
  const trimmed = text.trim();
  if (trimmed === '') throw new SampleFormatError('input is empty');

  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new SampleFormatError(`invalid JSON: ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new SampleFormatError('JSON root is not an array');
    if (parsed.length === 0) throw new SampleFormatError('JSON array is empty');
    return parsed.map((item, index) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        return pickField(item as Record<string, unknown>, options.field, `item ${index}`);
      }
      return toNumber(item, `item ${index}`);
    });
  }

  if (trimmed.startsWith('{')) {
    const values: number[] = [];
    const lines = trimmed.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.trim() === '') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new SampleFormatError(`invalid JSON object: ${(error as Error).message}`, index + 1);
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SampleFormatError('expected a JSON object per line', index + 1);
      }
      values.push(pickField(parsed as Record<string, unknown>, options.field, `line ${index + 1}`));
    });
    if (values.length === 0) throw new SampleFormatError('no JSON lines found');
    return values;
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
  const looksDelimited = lines.length > 1 && splitDelimited(lines[0]).length > 1;
  if (looksDelimited) return parseDelimited(lines, options.field);

  const values: number[] = [];
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (raw.startsWith('#')) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new SampleFormatError(`not a finite number: ${JSON.stringify(raw)}`, index + 1);
    }
    values.push(parsed);
  });
  if (values.length === 0) throw new SampleFormatError('no samples found');
  return values;
}
