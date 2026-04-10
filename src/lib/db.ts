import Dexie, { type Table } from 'dexie';
import { tokenize } from './search';

const ARTICLE_STORE_V2 = '++id, [feedId+guid], feedId, isoDate, read, starred, *words';
const ARTICLE_STORE_V3 =
    '++id, [feedId+guid], feedId, isoDate, read, starred, [feedId+isoDate], [read+isoDate], [starred+isoDate], [feedId+read+isoDate], [starred+read+isoDate], *words';
const ARTICLE_BODY_STORE = '&articleId, feedId';

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
    content?: string; // Legacy fallback for migrations/backups; article bodies live in articleBodies.
    snippet?: string;
    author?: string;
    isoDate: string;
    receivedDate: number; // When we fetched it
    read: 0 | 1; // Boolean stored as number for easier indexing if needed
    starred: 0 | 1;
    words?: string[]; // Search tokens
}

export interface ArticleBody {
    articleId: number;
    feedId: number;
    content: string;
}

export interface Folder {
    id?: number;
    name: string;
    collapsed?: 0 | 1;
}

type SettingValue = string | number | boolean | null | object;

export interface Settings {
    key: string;
    value: SettingValue;
}

class ReaderDB extends Dexie {
    feeds!: Table<Feed>;
    articles!: Table<Article>;
    articleBodies!: Table<ArticleBody>;
    folders!: Table<Folder>;
    settings!: Table<Settings>;

    constructor() {
        super('VesperDB');
        this.version(1).stores({
            feeds: '++id, &url, folderId',
            articles: ARTICLE_STORE_V2, // Compound index for uniqueness
            folders: '++id, &name',
            settings: '&key'
        });
        
        this.version(2).stores({
            articles: ARTICLE_STORE_V2
        }).upgrade(async trans => {
            // Migration: Tokenize existing articles
            // We use toCollection() to iterate safely over everything
            await trans.table('articles').toCollection().modify(article => {
                if (!article.words) {
                    // Combine title, snippet, and content for searching
                    const text = `${article.title} ${article.snippet || ''} ${article.content || ''}`;
                    article.words = tokenize(text);
                }
            });
        });

        this.version(3).stores({
            articles: ARTICLE_STORE_V3
        });

        this.version(4).stores({
            articles: ARTICLE_STORE_V3,
            articleBodies: ARTICLE_BODY_STORE,
        }).upgrade(async (trans) => {
            const allBodies: ArticleBody[] = [];

            await trans.table('articles').toCollection().modify((article: Article) => {
                if (article.id === undefined || typeof article.content !== 'string') return;

                allBodies.push({
                    articleId: article.id,
                    feedId: article.feedId,
                    content: article.content,
                });
                delete article.content;
            });

            // Insert bodies in chunks to avoid oversized single writes
            const CHUNK = 500;
            for (let i = 0; i < allBodies.length; i += CHUNK) {
                await trans.table('articleBodies').bulkPut(allBodies.slice(i, i + CHUNK));
            }
        });
    }
}

export const db = new ReaderDB();

/**
 * Retrieves a setting value from the database.
 *
 * @param key - The setting key to retrieve
 * @param defaultValue - Default value to return if setting doesn't exist
 * @returns The setting value, or defaultValue if not found
 *
 * @example
 * ```ts
 * const fontSize = await getSetting('fontSize', 16);
 * ```
 */
export async function getSetting<T extends SettingValue>(key: string, defaultValue?: T): Promise<T | undefined> {
    const s = await db.settings.get(key);
    return (s ? s.value : defaultValue) as T | undefined;
}

/**
 * Stores a setting value in the database.
 *
 * @param key - The setting key to store
 * @param value - The value to store (will be JSON serialized)
 *
 * @example
 * ```ts
 * await setSetting('fontSize', 18);
 * await setSetting('theme', 'dark');
 * ```
 */
export async function setSetting(key: string, value: SettingValue): Promise<void> {
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

export async function deleteFeedData(feedId: number) {
    await db.transaction('rw', db.feeds, db.articles, db.articleBodies, async () => {
        await db.articleBodies.where('feedId').equals(feedId).delete();
        await db.articles.where('feedId').equals(feedId).delete();
        await db.feeds.delete(feedId);
    });
}
