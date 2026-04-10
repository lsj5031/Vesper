/**
 * Simple logging utility for Vesper RSS Reader
 *
 * Provides consistent logging with levels and context awareness.
 * In production, logs can be disabled or redirected to external services.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
	level: LogLevel;
	message: string;
	context?: string;
	timestamp?: string;
}

class Logger {
	private isDevelopment = import.meta.env.DEV;

	private formatMessage(entry: LogEntry): string {
		const timestamp = entry.timestamp ?? new Date().toISOString();
		const prefix = entry.context ? `[${entry.context}] ` : '';
		return `[${timestamp}] ${entry.level.toUpperCase()}: ${prefix}${entry.message}`;
	}

	debug(message: string, context?: string): void {
		if (this.isDevelopment) {
			const entry: LogEntry = { level: 'debug', message, context };
			// eslint-disable-next-line no-console -- Centralized development logging belongs here.
			console.debug(this.formatMessage(entry));
		}
	}

	info(message: string, context?: string): void {
		if (this.isDevelopment) {
			const entry: LogEntry = { level: 'info', message, context };
			// eslint-disable-next-line no-console -- Centralized development logging belongs here.
			console.info(this.formatMessage(entry));
		}
	}

	warn(message: string, context?: string): void {
		console.warn(this.formatMessage({ level: 'warn', message, context }));
	}

	error(message: string, error?: Error | unknown, context?: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.error(this.formatMessage({ level: 'error', message: `${message}: ${errorMsg}`, context }));
		if (error instanceof Error && this.isDevelopment) {
			console.error(error.stack);
		}
	}
}

export const logger = new Logger();
