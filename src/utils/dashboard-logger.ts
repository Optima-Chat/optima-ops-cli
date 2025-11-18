import fs from 'fs';
import path from 'path';
import os from 'os';

class DashboardLogger {
  private logFile: string;
  private writeStream: fs.WriteStream | null = null;

  constructor() {
    // 日志文件路径：~/.optima/dashboard.log
    const logDir = path.join(os.homedir(), '.optima');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, 'dashboard.log');

    // 创建写入流（追加模式）
    this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  public log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any): void {
    const timestamp = this.formatTimestamp();
    let logLine = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      if (data instanceof Error) {
        logLine += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
      } else {
        logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`;
      }
    }

    logLine += '\n';

    if (this.writeStream) {
      this.writeStream.write(logLine);
    }
  }

  public info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  public warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  public error(message: string, error?: Error | any): void {
    this.log('ERROR', message, error);
  }

  public close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  public getLogPath(): string {
    return this.logFile;
  }
}

// 单例
export const dashboardLogger = new DashboardLogger();
