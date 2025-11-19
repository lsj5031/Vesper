import Dexie, { type Table } from 'dexie';

export interface Feed {
    id?: number;
    url: string;
    title: string;
    website: string;
    folderId?: number; // Optional: if null, it's in "Uncategorized"
    lastFetched?: number;
    favicon?: string;
    error?: string; // Last fetch error if any
}

export interface Article {
    id?: number;
    feedId: number;
    guid: string;
    title: string;
    link: string;
    content: string; // HTML content (sanitized before display, but stored raw-ish or sanitized? We'll sanitize on display or fetch)
    snippet?: string;
    author?: string;
    isoDate: string;
    receivedDate: number; // When we fetched it
    read: 0 | 1; // Boolean stored as number for easier indexing if needed
    starred: 0 | 1;
}

export interface Folder {
    id?: number;
    name: string;
    collapsed?: 0 | 1;
}

export interface Settings {
    key: string;
    value: any;
}

class ReaderDB extends Dexie {
    feeds!: Table<Feed>;
    articles!: Table<Article>;
    folders!: Table<Folder>;
    settings!: Table<Settings>;

    constructor() {
        super('VesperDB');
        this.version(1).stores({
            feeds: '++id, &url, folderId',
            articles: '++id, [feedId+guid], feedId, isoDate, read, starred', // Compound index for uniqueness
            folders: '++id, &name',
            settings: '&key'
        });
    }
}

export const db = new ReaderDB();

// Helper to get setting
export async function getSetting(key: string, defaultValue: any = null) {
    const s = await db.settings.get(key);
    return s ? s.value : defaultValue;
}

// Helper to set setting
export async function setSetting(key: string, value: any) {
    await db.settings.put({ key, value });
}

// Batch mark articles as read
export async function markArticlesAsRead(ids: number[]) {
    if (ids.length === 0) return;
    await db.articles.where('id').anyOf(ids).modify({ read: 1 });
}

// Batch mark articles as unread
export async function markArticlesAsUnread(ids: number[]) {
    if (ids.length === 0) return;
    await db.articles.where('id').anyOf(ids).modify({ read: 0 });
}

// Mark all articles in a feed as read
export async function markFeedAsRead(feedId: number) {
    await db.articles.where('feedId').equals(feedId).modify({ read: 1 });
}

// Mark all articles as read
export async function markAllArticlesAsRead() {
    await db.articles.toCollection().modify({ read: 1 });
}
