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

	private formatMessage(level: LogLevel, message: string, context?: string): string {
		const timestamp = new Date().toISOString();
		const prefix = context ? `[${context}]` : '';
		return `[${timestamp}] ${level.toUpperCase()}: ${prefix} ${message}`;
	}

	debug(message: string, context?: string): void {
		if (this.isDevelopment) {
			console.debug(this.formatMessage('debug', message, context));
		}
	}

	info(message: string, context?: string): void {
		if (this.isDevelopment) {
			console.info(this.formatMessage('info', message, context));
		}
	}

	warn(message: string, context?: string): void {
		console.warn(this.formatMessage('warn', message, context));
	}

	error(message: string, error?: Error | unknown, context?: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.error(this.formatMessage('error', `${message}: ${errorMsg}`, context));
		if (error instanceof Error && this.isDevelopment) {
			console.error(error.stack);
		}
	}
}

export const logger = new Logger();
