/**
 * Centralized configuration constants for Vesper RSS Reader
 *
 * This file contains all hard-coded values used throughout the application,
 * making it easier to tune performance and behavior without hunting through code.
 */

export const RSS_CONFIG = {
	/** Minimum interval between refresh-all-feeds operations (milliseconds) */
	REFRESH_ALL_MIN_INTERVAL_MS: 3 * 60 * 1000,

	/** Number of feeds to sync concurrently during refreshAllFeeds */
	CONCURRENCY: 3,

	/** Maximum number of retry attempts for fetching a single feed */
	MAX_FETCH_RETRIES: 2,

	/** Base delay for exponential backoff on feed fetch failures (milliseconds) */
	BACKOFF_BASE_MS: 500,

	/** Maximum backoff time for failed feeds (milliseconds) */
	MAX_BACKOFF_MS: 15 * 60 * 1000,

	/** Request timeout for fetching feeds (milliseconds) */
	FETCH_TIMEOUT_MS: 10000,
} as const;

export const ARTICLE_CONFIG = {
	/** Number of recent unread articles to preserve when auto-archiving */
	UNREAD_LIMIT: 50,

	/** Maximum number of articles to display in search results or lists */
	MAX_RESULTS: 300,

	/** Maximum length of article snippet for display (characters) */
	SNIPPET_LENGTH: 150,
} as const;

export const API_CONFIG = {
	/** Cache duration for feed responses (seconds) */
	CACHE_MAX_AGE: 3600,
} as const;

export const SEARCH_CONFIG = {
	/** Minimum word length to include in search tokens */
	MIN_WORD_LENGTH: 2,
} as const;
