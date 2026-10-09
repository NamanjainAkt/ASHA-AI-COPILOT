export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  error?: string;
  details?: Record<string, any>;
}

class Logger {
  private readonly maxBufferSize = 100;
  private buffer: LogEntry[] = [];

  private createEntry(
    level: LogLevel,
    tag: string,
    message: string,
    error?: unknown,
    details?: Record<string, any>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      tag,
      message,
      error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : error ? String(error) : undefined,
      details
    };

    this.buffer.unshift(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    return entry;
  }

  debug(tag: string, message: string, details?: Record<string, any>) {
    const entry = this.createEntry('debug', tag, message, undefined, details);
    if (__DEV__) {
      console.log(`[DEBUG][${tag}] ${message}`, details || '');
    }
  }

  info(tag: string, message: string, details?: Record<string, any>) {
    const entry = this.createEntry('info', tag, message, undefined, details);
    console.log(`[INFO][${tag}] ${message}`, details || '');
  }

  warn(tag: string, message: string, details?: Record<string, any>) {
    const entry = this.createEntry('warn', tag, message, undefined, details);
    console.warn(`[WARN][${tag}] ${message}`, details || '');
  }

  error(tag: string, message: string, error?: unknown, details?: Record<string, any>) {
    const entry = this.createEntry('error', tag, message, error, details);
    console.error(`[ERROR][${tag}] ${message}`, error || '', details || '');
  }

  getRecentLogs(limit: number = 50): LogEntry[] {
    return this.buffer.slice(0, limit);
  }

  clear() {
    this.buffer = [];
  }
}

export const logger = new Logger();
