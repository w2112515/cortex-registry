/**
 * Watchdog Logger Module
 * 
 * @description Structured logging for the Watchdog Bot
 */

// ============ Types ============

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
}

// ============ Logger ============

/**
 * Simple structured logger for Watchdog operations
 */
export class Logger {
    private name: string;
    private minLevel: LogLevel;

    private static levelPriority: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };

    constructor(name: string, minLevel: LogLevel = 'info') {
        this.name = name;
        this.minLevel = minLevel;
    }

    private shouldLog(level: LogLevel): boolean {
        return Logger.levelPriority[level] >= Logger.levelPriority[this.minLevel];
    }

    private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            context,
        };
    }

    private output(entry: LogEntry): void {
        const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${this.name}]`;
        const msg = `${prefix} ${entry.message}`;

        if (entry.context) {
            console.log(msg, JSON.stringify(entry.context, null, 2));
        } else {
            console.log(msg);
        }
    }

    debug(message: string, context?: Record<string, unknown>): void {
        if (this.shouldLog('debug')) {
            this.output(this.formatEntry('debug', message, context));
        }
    }

    info(message: string, context?: Record<string, unknown>): void {
        if (this.shouldLog('info')) {
            this.output(this.formatEntry('info', message, context));
        }
    }

    warn(message: string, context?: Record<string, unknown>): void {
        if (this.shouldLog('warn')) {
            this.output(this.formatEntry('warn', message, context));
        }
    }

    error(message: string, context?: Record<string, unknown>): void {
        if (this.shouldLog('error')) {
            this.output(this.formatEntry('error', message, context));
        }
    }
}

// ============ Default Logger ============

export const watchdogLogger = new Logger('Watchdog',
    (process.env.LOG_LEVEL as LogLevel) || 'info'
);
