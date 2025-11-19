import Parser from 'rss-parser';
import DOMPurify from 'dompurify';
import { db, type Feed, type Article } from './db';
import { get } from 'svelte/store';
import { userSettings } from './stores';

// Initialize Parser
const parser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'dc:creator'],
    }
});

// Initialize DOMPurify (needs window context, so check for browser)
let sanitize = (html: string) => html;
if (typeof window !== 'undefined') {
    sanitize = (html: string) => DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'img', 'h1', 'h2', 'h3', 'h4', 'code', 'pre'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target']
    });
}

export async function fetchFeed(url: string) {
    // Use backend proxy endpoint to avoid CORS issues
    const proxyUrl = `/api/fetch-feed?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        const feedData = await parser.parseString(text);
        
        return feedData;
    } catch (e) {
        console.error(`Failed to fetch ${url}`, e);
        throw e;
    }
}

export async function syncFeed(feed: Feed) {
    try {
        const data = await fetchFeed(feed.url);
        
        // Update Feed Metadata
        await db.feeds.update(feed.id!, {
            title: feed.title || data.title || 'Unknown Feed',
            lastFetched: Date.now(),
            error: undefined
        });

        // Process Articles
        const newArticles: Article[] = data.items.map(item => {
            const contentRaw = item['content:encoded'] || item.content || item.summary || '';
            const cleanContent = sanitize(contentRaw);
            
            return {
                feedId: feed.id!,
                guid: item.guid || item.link || item.title || Math.random().toString(),
                title: item.title || 'Untitled',
                link: item.link || '',
                content: cleanContent,
                snippet: cleanContent.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...',
                author: item.creator || item['dc:creator'],
                isoDate: item.isoDate || new Date().toISOString(),
                receivedDate: Date.now(),
                read: 0,
                starred: 0
            };
        });

        // Bulk Put (Dexie will handle duplicates if we use the right keys, but 'put' might overwrite read status)
        // We want to add NEW articles, but not overwrite existing read status of old ones.
        // Strategy: Check existence of GUIDs or catch errors on 'add'.
        // Better Strategy: Use a transaction.
        
        await db.transaction('rw', db.articles, async () => {
            for (const article of newArticles) {
                const existing = await db.articles
                    .where({ feedId: article.feedId, guid: article.guid })
                    .first();
                
                if (!existing) {
                    await db.articles.add(article);
                }
            }
        });

        return newArticles.length;
    } catch (err: any) {
        await db.feeds.update(feed.id!, { error: err.message });
        throw err;
    }
}

export async function addNewFeed(url: string, folderId?: number) {
    // 1. Fetch first to validate
    const data = await fetchFeed(url);
    
    // 2. Add to DB
    const feedId = await db.feeds.add({
        url,
        title: data.title || new URL(url).hostname,
        website: data.link || url,
        folderId,
        lastFetched: 0 // Trigger sync immediately after
    });

    // 3. Sync content
    const feed = await db.feeds.get(feedId);
    if (feed) await syncFeed(feed);
    
    return feedId;
}

export async function refreshAllFeeds() {
    const feeds = await db.feeds.toArray();
    const results = await Promise.allSettled(feeds.map(f => syncFeed(f)));
    return results;
}
