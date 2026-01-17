import { writable } from 'svelte/store';
import { localStorageStore } from '@skeletonlabs/skeleton';

// UI State
export const sidebarState = writable<'open' | 'closed'>('open'); // For mobile mostly, or collapsible
export const selectedFeedId = writable<number | 'all' | 'starred' | null>('all');
export const selectedArticleId = writable<number | null>(null);

// Global Search/Filter
export const searchQuery = writable<string>('');

// Refresh Progress (null when not refreshing, otherwise {completed, total})
export const refreshProgress = writable<{ completed: number; total: number } | null>(null);

// Help Modal
export const showHelp = writable<boolean>(false);

// Settings Modal
export const showSettings = writable<boolean>(false);

// Settings Store (Synced with LocalStorage for immediate UI prefs, DB for deeper config)
export const userSettings = localStorageStore('vesper-settings', {
    theme: 'vesper',
    proxyUrl: '', // Uses window.location.origin/api/fetch-feed by default
    refreshInterval: 15, // minutes
    showRead: false, // show read articles
    layout: '3-panel' as '3-panel' | 'list-only',
    fontSize: 18,
});

// Theme (day/night)
export const themeMode = localStorageStore<'dark' | 'light'>('vesper-theme-mode', 'light');
