import { db } from "./db";
import { tokenize } from "./search";

export interface BackupProgress {
    stage: string;
    current: number;
    total: number;
}

interface BackupData {
    version: number;
    timestamp: number;
    feeds: Array<{ url: string; [key: string]: unknown }>;
    folders: Array<{ name?: string; [key: string]: unknown }>;
    articles: Array<{ feedId: number; guid: string; [key: string]: unknown }>;
    settings: Array<{ key?: string; [key: string]: unknown }>;
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

        if (data.feeds.length) {
            onProgress?.({ stage: "Restoring feeds", current: ++currentStep, total: totalSteps });
            await db.feeds.bulkPut(data.feeds as any);
        }
        if (data.folders.length) {
            onProgress?.({ stage: "Restoring folders", current: ++currentStep, total: totalSteps });
            await db.folders.bulkPut(data.folders as any);
        }
        if (data.articles.length) {
            onProgress?.({
                stage: "Restoring articles",
                current: ++currentStep,
                total: totalSteps,
            });

            const articleSummaries = data.articles.map((article) => {
                const content = typeof article.content === "string" ? article.content : "";
                const { content: _content, ...summary } = article;

                return {
                    ...summary,
                    words: Array.isArray(article.words)
                        ? article.words
                        : tokenize(`${typeof article.title === "string" ? article.title : ""} ${content}`),
                };
            });

            await db.articles.bulkPut(articleSummaries as any);

            const storedArticles = await db.articles
                .where("[feedId+guid]")
                .anyOf(articleSummaries.map((article) => [article.feedId, article.guid]))
                .toArray();
            const articleIdByKey = new Map(
                storedArticles
                    .filter((article) => article.id !== undefined)
                    .map((article) => [`${article.feedId}:${article.guid}`, article.id as number])
            );
            const articleBodies = data.articles
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
        if (data.settings.length) {
            onProgress?.({
                stage: "Restoring settings",
                current: ++currentStep,
                total: totalSteps,
            });
            await db.settings.bulkPut(data.settings as any);
        }
        }
    );
}

function isValidBackupData(data: unknown): data is BackupData {
    if (typeof data !== "object" || data === null) return false;

    const d = data as Record<string, unknown>;

    // Check required fields exist and have correct types
    if (typeof d.version !== "number") return false;
    if (typeof d.timestamp !== "number") return false;
    if (!Array.isArray(d.feeds)) return false;
    if (!Array.isArray(d.folders)) return false;
    if (!Array.isArray(d.articles)) return false;
    if (!Array.isArray(d.settings)) return false;

    // Basic validation of array contents
    for (const feed of d.feeds) {
        if (typeof feed !== "object" || feed === null) return false;
        if (typeof (feed as any).url !== "string") return false;
    }

    for (const article of d.articles) {
        if (typeof article !== "object" || article === null) return false;
        if (typeof (article as any).feedId !== "number") return false;
        if (typeof (article as any).guid !== "string") return false;
    }

    return true;
}

function validateBackupDuplicates(data: BackupData): { isValid: boolean; error?: string } {
    const feedUrls = new Set<string>();
    for (const feed of data.feeds) {
        const url = (feed as any).url as string;
        if (feedUrls.has(url)) {
            return { isValid: false, error: `Duplicate feed URL found in backup: ${url}` };
        }
        feedUrls.add(url);
    }

    const folderNames = new Set<string>();
    for (const folder of data.folders) {
        const name = (folder as any).name as string | undefined;
        if (name) {
            if (folderNames.has(name)) {
                return { isValid: false, error: `Duplicate folder name found in backup: ${name}` };
            }
            folderNames.add(name);
        }
    }

    const articleKeys = new Set<string>();
    for (const article of data.articles) {
        const feedId = (article as any).feedId as number;
        const guid = (article as any).guid as string;
        const key = `${feedId}:${guid}`;
        if (articleKeys.has(key)) {
            return {
                isValid: false,
                error: `Duplicate article GUID found for feed ${feedId}: ${guid}`,
            };
        }
        articleKeys.add(key);
    }

    const settingKeys = new Set<string>();
    for (const setting of data.settings) {
        const key = (setting as any).key as string | undefined;
        if (key) {
            if (settingKeys.has(key)) {
                return { isValid: false, error: `Duplicate setting key found in backup: ${key}` };
            }
            settingKeys.add(key);
        }
    }

    return { isValid: true };
}
