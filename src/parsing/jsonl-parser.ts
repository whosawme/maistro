import * as fs from 'fs';
import * as readline from 'readline';
import { TranscriptLine } from '../types';

export async function parseJsonlFile(filePath: string): Promise<TranscriptLine[]> {
  const lines: TranscriptLine[] = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TranscriptLine;
      if (parsed.uuid && parsed.timestamp) {
        lines.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return lines;
}

export async function parseJsonlFromOffset(
  filePath: string,
  byteOffset: number,
): Promise<{ lines: TranscriptLine[]; newOffset: number }> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { lines: [], newOffset: byteOffset };
  }
  if (stat.size <= byteOffset) {
    return { lines: [], newOffset: byteOffset };
  }

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf-8',
    start: byteOffset,
  });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const lines: TranscriptLine[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TranscriptLine;
      if (parsed.uuid && parsed.timestamp) {
        lines.push(parsed);
      }
    } catch {
      // Skip
    }
  }

  return { lines, newOffset: stat.size };
}
