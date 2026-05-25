/** 收集转发任务 CLI 风格日志，并回传给管理台展示 */
export class RunLogger {
  private readonly lines: string[] = [];
  constructor(private readonly onLine?: (line: string) => void) {}

  log(message: string): void {
    const text = String(message);
    for (const line of text.split("\n")) {
      if (line.length > 0) {
        this.lines.push(line);
        this.onLine?.(line);
      }
    }
    console.log(text);
  }

  warn(message: string): void {
    this.log(`[warn] ${message}`);
  }

  getLines(): string[] {
    return [...this.lines];
  }

  clear(): void {
    this.lines.length = 0;
  }
}

export type RunLogFn = (message: string) => void;

export function createRunLogFn(logger?: RunLogger): RunLogFn {
  if (logger) return (message) => logger.log(message);
  return (message) => console.log(message);
}
