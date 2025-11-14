import chalk from 'chalk';

/**
 * Command execution timer
 */
export class CommandTimer {
  private startTime: number;
  private stepTimes: Map<string, number>;
  private lastStepTime: number;

  constructor() {
    this.startTime = Date.now();
    this.lastStepTime = this.startTime;
    this.stepTimes = new Map();
  }

  step(name: string): number {
    const now = Date.now();
    const elapsed = now - this.lastStepTime;
    this.stepTimes.set(name, elapsed);
    this.lastStepTime = now;
    return elapsed;
  }

  total(): number {
    return Date.now() - this.startTime;
  }

  static format(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  static colorize(ms: number, text: string): string {
    if (ms < 1000) {
      return chalk.green(text);
    } else if (ms < 5000) {
      return chalk.yellow(text);
    } else {
      return chalk.red(text);
    }
  }

  printSummary(): void {
    if (this.stepTimes.size === 0) return;

    console.log(chalk.gray('\n⏱️  执行时间:'));

    for (const [name, time] of this.stepTimes) {
      const formatted = CommandTimer.format(time);
      const colored = CommandTimer.colorize(time, formatted);
      console.log(chalk.gray(`  ${name}: ${colored}`));
    }

    const total = this.total();
    const totalFormatted = CommandTimer.format(total);
    const totalColored = CommandTimer.colorize(total, totalFormatted);
    console.log(chalk.gray(`  总计: ${totalColored}`));
  }

  getTimingData(): { steps: Record<string, number>; total: number } {
    const steps: Record<string, number> = {};
    for (const [name, time] of this.stepTimes) {
      steps[name] = time;
    }
    return { steps, total: this.total() };
  }
}

export function isTimingEnabled(): boolean {
  return process.env.OPTIMA_TIMING === 'true' || process.env.OPTIMA_TIMING === '1';
}
