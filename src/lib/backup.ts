import { db } from './db';

export interface BackupProgress {
    stage: string;
    current: number;
    total: number;
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
    onProgress?.({ stage: 'Exporting feeds', current: 0, total: 4 });
    const data = {
        version: 1,
        timestamp: Date.now(),
        feeds: await db.feeds.toArray(),
        folders: await db.folders.toArray(),
        articles: await db.articles.toArray(),
        settings: await db.settings.toArray()
    };

    onProgress?.({ stage: 'Creating backup file', current: 4, total: 4 });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vesper-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        throw new Error('Invalid JSON format');
    }

    if (!isValidBackupData(data)) {
        throw new Error('Invalid backup file: missing required fields');
    }

    const totalSteps = 5;
    let currentStep = 0;

    await db.transaction('rw', db.feeds, db.folders, db.articles, db.settings, async () => {
        onProgress?.({ stage: 'Clearing existing data', current: ++currentStep, total: totalSteps });
        await db.feeds.clear();
        await db.folders.clear();
        await db.articles.clear();
        await db.settings.clear();

        if (data.feeds.length) {
            onProgress?.({ stage: 'Restoring feeds', current: ++currentStep, total: totalSteps });
            await db.feeds.bulkAdd(data.feeds as any);
        }
        if (data.folders.length) {
            onProgress?.({ stage: 'Restoring folders', current: ++currentStep, total: totalSteps });
            await db.folders.bulkAdd(data.folders as any);
        }
        if (data.articles.length) {
            onProgress?.({ stage: 'Restoring articles', current: ++currentStep, total: totalSteps });
            await db.articles.bulkAdd(data.articles as any);
        }
        if (data.settings.length) {
            onProgress?.({ stage: 'Restoring settings', current: ++currentStep, total: totalSteps });
            await db.settings.bulkAdd(data.settings as any);
        }
    });
}

function isValidBackupData(data: unknown): data is {
    version: number;
    timestamp: number;
    feeds: unknown[];
    folders: unknown[];
    articles: unknown[];
    settings: unknown[];
} {
    if (typeof data !== 'object' || data === null) return false;
    
    const d = data as Record<string, unknown>;
    return (
        'version' in d &&
        'timestamp' in d &&
        'feeds' in d && Array.isArray(d.feeds) &&
        'folders' in d && Array.isArray(d.folders) &&
        'articles' in d && Array.isArray(d.articles) &&
        'settings' in d && Array.isArray(d.settings)
    );
}
