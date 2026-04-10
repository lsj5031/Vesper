import { db, type Article, type Feed, type Folder, type Settings } from "./db";
import { tokenize } from "./search";

export interface BackupProgress {
    stage: string;
    current: number;
    total: number;
}

type BackupFeed = {
    id?: unknown;
    url: string;
    title?: unknown;
    website?: unknown;
    folderId?: unknown;
    lastFetched?: unknown;
    favicon?: unknown;
    error?: unknown;
};

type BackupFolder = {
    id?: unknown;
    name: string;
    collapsed?: unknown;
};

type BackupArticle = {
    id?: unknown;
    feedId: number;
    guid: string;
    title?: unknown;
    link?: unknown;
    content?: unknown;
    snippet?: unknown;
    author?: unknown;
    isoDate?: unknown;
    receivedDate?: unknown;
    read?: unknown;
    starred?: unknown;
    words?: unknown;
};

type BackupSetting = {
    key: string;
    value?: unknown;
};

interface BackupData {
    version: number;
    timestamp: number;
    feeds: BackupFeed[];
    folders: BackupFolder[];
    articles: BackupArticle[];
    settings: BackupSetting[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizeFlag(value: unknown): 0 | 1 {
    return value === 1 || value === true ? 1 : 0;
}

function normalizeBackupFeed(feed: BackupFeed): Feed {
    return {
        id: typeof feed.id === "number" ? feed.id : undefined,
        url: feed.url,
        title: typeof feed.title === "string" ? feed.title : feed.url,
        website: typeof feed.website === "string" ? feed.website : feed.url,
        folderId: typeof feed.folderId === "number" ? feed.folderId : undefined,
        lastFetched: typeof feed.lastFetched === "number" ? feed.lastFetched : undefined,
        favicon: typeof feed.favicon === "string" ? feed.favicon : undefined,
        error: typeof feed.error === "string" ? feed.error : undefined,
    };
}

function normalizeBackupFolder(folder: BackupFolder): Folder {
    return {
        id: typeof folder.id === "number" ? folder.id : undefined,
        name: folder.name,
        collapsed:
            folder.collapsed === 0 || folder.collapsed === 1 ? folder.collapsed : undefined,
    };
}

function normalizeBackupArticle(article: BackupArticle): Article {
    return {
        id: typeof article.id === "number" ? article.id : undefined,
        feedId: article.feedId,
        guid: article.guid,
        title: typeof article.title === "string" ? article.title : "Untitled",
        link: typeof article.link === "string" ? article.link : "",
        content: typeof article.content === "string" ? article.content : "",
        snippet: typeof article.snippet === "string" ? article.snippet : undefined,
        author: typeof article.author === "string" ? article.author : undefined,
        isoDate:
            typeof article.isoDate === "string" ? article.isoDate : new Date().toISOString(),
        receivedDate:
            typeof article.receivedDate === "number" ? article.receivedDate : Date.now(),
        read: normalizeFlag(article.read),
        starred: normalizeFlag(article.starred),
        words: Array.isArray(article.words)
            ? article.words.filter((word): word is string => typeof word === "string")
            : undefined,
    };
}

function normalizeBackupSetting(setting: BackupSetting): Settings {
    return {
        key: setting.key,
        value: setting.value ?? null,
    };
}

/**
 * Exports all database data to a JSON backup file.
 *
 * Creates a complete backup of feeds, folders, articles, and settings.
 * Triggers a browser download with filename: vesper-backup-YYYY-MM-DD.json
 *
 * @example
 * ```ts
 * exportBackup(); // Downloads vesper-backup-2025-01-17.json
 * ```
 */
export async function exportBackup(onProgress?: (progress: BackupProgress) => void) {
    onProgress?.({ stage: "Exporting feeds", current: 0, total: 4 });

    const [feeds, folders, articles, articleBodies, settings] = await Promise.all([
        db.feeds.toArray(),
        db.folders.toArray(),
        db.articles.toArray(),
        db.articleBodies.toArray(),
        db.settings.toArray(),
    ]);
    const bodyByArticleId = new Map(articleBodies.map((body) => [body.articleId, body.content]));

    const data = {
        version: 1,
        timestamp: Date.now(),
        feeds,
        folders,
        articles: articles.map((article) => ({
            ...article,
            content: article.id !== undefined ? bodyByArticleId.get(article.id) ?? article.content ?? "" : "",
        })),
        settings,
    };

    onProgress?.({ stage: "Creating backup file", current: 4, total: 4 });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vesper-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Imports database data from a JSON backup file.
 *
 * WARNING: This operation clears all existing data before importing.
 * Use with caution and consider creating a backup first.
 *
 * @param file - The backup JSON file to import
 * @param onProgress - Optional callback to report import progress
 * @throws {Error} If the backup file is invalid (missing feeds or articles)
 *
 * @example
 * ```ts
 * const fileInput = document.querySelector('input[type="file"]');
 * await importBackup(fileInput.files[0], (progress) => {
 *     console.log(`${progress.stage}: ${progress.current}/${progress.total}`);
 * });
 * ```
 */
export async function importBackup(file: File, onProgress?: (progress: BackupProgress) => void) {
    const text = await file.text();
    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Invalid JSON format");
    }

    if (!isValidBackupData(data)) {
        throw new Error("Invalid backup file: missing required fields");
    }

    const duplicateCheck = validateBackupDuplicates(data);
    if (!duplicateCheck.isValid) {
        throw new Error(`Invalid backup file: ${duplicateCheck.error}`);
    }

    const restoredFeeds = data.feeds.map(normalizeBackupFeed);
    const restoredFolders = data.folders.map(normalizeBackupFolder);
    const restoredArticles = data.articles.map(normalizeBackupArticle);
    const restoredSettings = data.settings.map(normalizeBackupSetting);

    const totalSteps = 5;
    let currentStep = 0;

    await db.transaction(
        "rw",
        [db.feeds, db.folders, db.articles, db.articleBodies, db.settings],
        async () => {
        onProgress?.({
            stage: "Clearing existing data",
            current: ++currentStep,
            total: totalSteps,
        });
        await db.feeds.clear();
        await db.folders.clear();
        await db.articles.clear();
        await db.articleBodies.clear();
        await db.settings.clear();

        if (restoredFeeds.length) {
            onProgress?.({ stage: "Restoring feeds", current: ++currentStep, total: totalSteps });
            await db.feeds.bulkPut(restoredFeeds);
        }
        if (restoredFolders.length) {
            onProgress?.({ stage: "Restoring folders", current: ++currentStep, total: totalSteps });
            await db.folders.bulkPut(restoredFolders);
        }
        if (restoredArticles.length) {
            onProgress?.({
                stage: "Restoring articles",
                current: ++currentStep,
                total: totalSteps,
            });

            const articleSummaries: Article[] = restoredArticles.map((article) => {
                const content = typeof article.content === "string" ? article.content : "";
                const { content: _content, ...summary } = article;

                return {
                    ...summary,
                    words: Array.isArray(article.words)
                        ? article.words
                        : tokenize(`${typeof article.title === "string" ? article.title : ""} ${content}`),
                };
            });

            await db.articles.bulkPut(articleSummaries);

            const storedArticles = await db.articles
                .where("[feedId+guid]")
                .anyOf(articleSummaries.map((article) => [article.feedId, article.guid]))
                .toArray();
            const articleIdByKey = new Map(
                storedArticles
                    .filter((article) => article.id !== undefined)
                    .map((article) => [`${article.feedId}:${article.guid}`, article.id as number])
            );
            const articleBodies = restoredArticles
                .map((article) => {
                    const articleId = article.id ?? articleIdByKey.get(`${article.feedId}:${article.guid}`);
                    if (articleId === undefined) return null;

                    return {
                        articleId,
                        feedId: article.feedId,
                        content: typeof article.content === "string" ? article.content : "",
                    };
                })
                .filter((body): body is { articleId: number; feedId: number; content: string } => body !== null);

            if (articleBodies.length > 0) {
                await db.articleBodies.bulkPut(articleBodies);
            }
        }
        if (restoredSettings.length) {
            onProgress?.({
                stage: "Restoring settings",
                current: ++currentStep,
                total: totalSteps,
            });
            await db.settings.bulkPut(restoredSettings);
        }
        }
    );
}

function isValidBackupData(data: unknown): data is BackupData {
    if (!isRecord(data)) return false;

    const d = data;

    // Check required fields exist and have correct types
    if (typeof d.version !== "number") return false;
    if (typeof d.timestamp !== "number") return false;
    if (!Array.isArray(d.feeds)) return false;
    if (!Array.isArray(d.folders)) return false;
    if (!Array.isArray(d.articles)) return false;
    if (!Array.isArray(d.settings)) return false;

    // Basic validation of array contents
    for (const feed of d.feeds) {
        if (!isRecord(feed)) return false;
        if (typeof feed.url !== "string") return false;
    }

    for (const folder of d.folders) {
        if (!isRecord(folder)) return false;
        if (typeof folder.name !== "string") return false;
    }

    for (const article of d.articles) {
        if (!isRecord(article)) return false;
        if (typeof article.feedId !== "number") return false;
        if (typeof article.guid !== "string") return false;
    }

    for (const setting of d.settings) {
        if (!isRecord(setting)) return false;
        if (typeof setting.key !== "string") return false;
    }

    return true;
}

function validateBackupDuplicates(data: BackupData): { isValid: boolean; error?: string } {
    const feedUrls = new Set<string>();
    for (const feed of data.feeds) {
        const url = feed.url;
        if (feedUrls.has(url)) {
            return { isValid: false, error: `Duplicate feed URL found in backup: ${url}` };
        }
        feedUrls.add(url);
    }

    const folderNames = new Set<string>();
    for (const folder of data.folders) {
        if (folderNames.has(folder.name)) {
            return { isValid: false, error: `Duplicate folder name found in backup: ${folder.name}` };
        }
        folderNames.add(folder.name);
    }

    const articleKeys = new Set<string>();
    for (const article of data.articles) {
        const key = `${article.feedId}:${article.guid}`;
        if (articleKeys.has(key)) {
            return {
                isValid: false,
                error: `Duplicate article GUID found for feed ${article.feedId}: ${article.guid}`,
            };
        }
        articleKeys.add(key);
    }

    const settingKeys = new Set<string>();
    for (const setting of data.settings) {
        if (settingKeys.has(setting.key)) {
            return { isValid: false, error: `Duplicate setting key found in backup: ${setting.key}` };
        }
        settingKeys.add(setting.key);
    }

    return { isValid: true };
}
