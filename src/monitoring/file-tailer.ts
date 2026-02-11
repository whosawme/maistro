import * as fs from 'fs';
import { Subagent } from '../types';
import { extractSubagentData } from '../parsing/subagent-parser';
import { parseJsonlFromOffset } from '../parsing/jsonl-parser';

export class FileTailer {
  private byteOffset: number;
  private disposed = false;

  constructor(
    private filePath: string,
    private onNewData: (data: Partial<Subagent>) => void,
  ) {
    try {
      this.byteOffset = fs.statSync(filePath).size;
    } catch {
      this.byteOffset = 0;
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.disposed) return;
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size <= this.byteOffset) return;

      const { lines, newOffset } = await parseJsonlFromOffset(
        this.filePath,
        this.byteOffset,
      );
      this.byteOffset = newOffset;

      if (lines.length > 0) {
        const data = extractSubagentData(lines, this.filePath);
        this.onNewData(data);
      }
    } catch {
      // File may have been deleted or moved
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
