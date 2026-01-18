import { db } from './db';
import { logger } from './logger';

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export interface ImportProgress {
    current: number;
    total: number;
    currentFile: string;
}

/**
 * Imports feeds and folders from an OPML file.
 *
 * Parses the OPML XML structure and adds feeds/folders to the database.
 * Skips feeds that already exist (based on URL).
 *
 * @param file - The OPML file to import
 * @param onProgress - Optional callback to report import progress
 * @throws {Error} If the OPML is invalid (missing body element)
 *
 * @example
 * ```ts
 * const fileInput = document.querySelector('input[type="file"]');
 * await importOPML(fileInput.files[0], (progress) => {
 *     console.log(`Importing ${progress.current}/${progress.total}: ${progress.currentFile}`);
 * });
 * ```
 */
export async function importOPML(file: File, onProgress?: (progress: ImportProgress) => void) {
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    
    if (xml.querySelector('parsererror')) throw new Error('Invalid OPML: XML parse error');

    const body = xml.querySelector('body');
    if (!body) throw new Error('Invalid OPML: missing body element');

    // First pass: count total items
    const countItems = (node: Element): number => {
        let count = 0;
        for (const child of Array.from(node.children)) {
            if (child.tagName.toLowerCase() === 'outline') {
                const xmlUrl = child.getAttribute('xmlUrl');
                if (xmlUrl) {
                    count++;
                } else {
                    count += countItems(child);
                }
            }
        }
        return count;
    };

    const totalItems = countItems(body);
    let processedItems = 0;

    // Pre-load existing feeds and folders for O(1) lookups
    const existingFeeds = await db.feeds.toArray();
    const existingFeedUrls = new Set(existingFeeds.map(f => f.url));

    const existingFolders = await db.folders.toArray();
    const folderNameToId = new Map<string, number>();
    existingFolders.forEach(f => {
        if (f.id !== undefined) {
            folderNameToId.set(f.name, f.id);
        }
    });

    const processOutline = async (node: Element, parentFolderId?: number) => {
        const xmlUrl = node.getAttribute('xmlUrl');
        const textAttr = node.getAttribute('text') || node.getAttribute('title');

        if (xmlUrl) {
            // It's a feed
            try {
                if (!existingFeedUrls.has(xmlUrl)) {
                    await db.feeds.add({
                        url: xmlUrl,
                        title: textAttr || 'Untitled',
                        website: node.getAttribute('htmlUrl') || '',
                        folderId: parentFolderId
                    });
                    existingFeedUrls.add(xmlUrl);
                }
                processedItems++;
                onProgress?.({
                    current: processedItems,
                    total: totalItems,
                    currentFile: textAttr || 'Untitled'
                });
            } catch (e) {
                logger.error('Failed to import feed', e, 'OPML');
                processedItems++;
                onProgress?.({
                    current: processedItems,
                    total: totalItems,
                    currentFile: textAttr || 'Untitled'
                });
            }
        } else if (Array.from(node.children).some(c => c.tagName.toLowerCase() === 'outline')) {
            // It's likely a folder
            let folderId = parentFolderId;
            if (textAttr) {
                // Create folder
                const existingFolderId = folderNameToId.get(textAttr);
                if (existingFolderId !== undefined) {
                    folderId = existingFolderId;
                } else {
                    const newFolderId = await db.folders.add({ name: textAttr });
                    folderId = newFolderId;
                    if (newFolderId !== undefined) {
                        folderNameToId.set(textAttr, newFolderId);
                    }
                }
            }
            
            // Process children
            for (const child of Array.from(node.children)) {
                if (child.tagName.toLowerCase() === 'outline') {
                    await processOutline(child, folderId);
                }
            }
        }
    };

    const outlines = body.children;
    for (const node of Array.from(outlines)) {
        if (node.tagName.toLowerCase() === 'outline') {
            await processOutline(node);
        }
    }

    onProgress?.({
        current: totalItems,
        total: totalItems,
        currentFile: 'Complete'
    });
}

/**
 * Exports feeds and folders to an OPML file.
 *
 * Generates an OPML XML document from the database and triggers a download.
 * Organizes feeds by folder, with uncategorized feeds at the root level.
 *
 * @example
 * ```ts
 * exportOPML(); // Triggers browser download of vesper-subs.opml
 * ```
 */
export async function exportOPML() {
    const feeds = await db.feeds.toArray();
    const folders = await db.folders.toArray();
    
    let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Vesper Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>`;

    // 1. Process Folders
    for (const folder of folders) {
        const folderName = escapeXml(folder.name);
        opml += `\n    <outline text="${folderName}" title="${folderName}">`;
        const folderFeeds = feeds.filter(f => f.folderId === folder.id);
        for (const feed of folderFeeds) {
            const title = escapeXml(feed.title || '');
            const xmlUrl = escapeXml(feed.url || '');
            const htmlUrl = escapeXml(feed.website || '');
            opml += `\n      <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
        }
        opml += `\n    </outline>`;
    }

    // 2. Process Uncategorized
    const uncategorized = feeds.filter(f => !f.folderId);
    for (const feed of uncategorized) {
        const title = escapeXml(feed.title || '');
        const xmlUrl = escapeXml(feed.url || '');
        const htmlUrl = escapeXml(feed.website || '');
        opml += `\n    <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
    }

    opml += `\n  </body>\n</opml>`;
    
    const blob = new Blob([opml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vesper-subs.opml';
    a.click();
    URL.revokeObjectURL(url);
}
