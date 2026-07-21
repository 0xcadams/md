export interface LineRange {
  end: number;
  start: number;
}

const lineHashPattern = /^#L([1-9]\d*)(?:-L([1-9]\d*))?$/;

export function parseLineHash(hash: string): LineRange | undefined {
  const match = lineHashPattern.exec(hash);
  if (match === null) return undefined;

  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return undefined;

  return {end: Math.max(first, last), start: Math.min(first, last)};
}

export function formatLineHash(anchor: number, line: number): string {
  if (anchor === line) return `#L${line}`;
  return `#L${Math.min(anchor, line)}-L${Math.max(anchor, line)}`;
}
