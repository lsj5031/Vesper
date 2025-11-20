import Parser from 'rss-parser';
import DOMPurify from 'dompurify';
import { db, type Feed, type Article } from './db';
import { tokenize } from './search';
import { refreshProgress } from './stores';


// Initialize Parser with error-tolerant settings
const parser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'dc:creator'],
    },
    defaultRSS: 2.0,  // Assume RSS 2.0 if detection fails
    xml2js: {
        strict: false,  // Disable strict XML parsing
        resolveNamespace: true,
        normalizeTags: true
    }
});

// Pre-process malformed feeds to fix common issues
function cleanupMalformedXML(xmlText: string): string {
    // Merge adjacent CDATA sections (e.g., ]]><![CDATA[ -> join content)
    xmlText = xmlText.replace(/\]\]>\s*<!\[CDATA\[/g, '');
    
    // Fix attributes without values, but only inside start tags (avoid touching text/CDATA)
    xmlText = xmlText.replace(/<[^/?!][^>]*>/g, (tag) =>
        tag.replace(/(\s+[^\s=\/>]+)(?=(?:\s|\/)*>)/g, '$1=""')
    );
    
    // Fix unclosed self-closing tags (br, img, hr, etc)
    xmlText = xmlText.replace(/(<(?:br|img|hr|input|meta|link)[^>]*)(?<!\/)(>)/g, '$1/$2');
    
    return xmlText;
}

// Initialize DOMPurify (needs window context, so check for browser)
let sanitize = (html: string) => html;
if (typeof window !== 'undefined') {
    sanitize = (html: string) => DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'img', 'h1', 'h2', 'h3', 'h4', 'code', 'pre'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target']
    });
}

function resolveUrl(candidate: string, bases: string[]): string {
    const trimmed = candidate.trim();
    if (!trimmed) return '';

    try {
        // Absolute URL
        return new URL(trimmed).toString();
    } catch {
        // Try resolving relative URLs against provided bases
        for (const base of bases) {
            try {
                return new URL(trimmed, base).toString();
            } catch {
                continue;
            }
        }
    }

    return '';
}

function resolveItemLink(item: any, feed: Feed): string {
    const baseCandidates = [feed.website, feed.url].filter(Boolean) as string[];

    const linkCandidate = Array.isArray(item.link) ? item.link[0] : item.link;
    // rss-parser sometimes returns Atom links as objects with href
    const rawLink =
        (typeof linkCandidate === 'string' && linkCandidate) ? linkCandidate :
        (linkCandidate && typeof linkCandidate.href === 'string') ? linkCandidate.href :
        '';

    const guidCandidate = typeof item.guid === 'string' ? item.guid : '';

    return (
        resolveUrl(rawLink, baseCandidates) ||
        resolveUrl(guidCandidate, baseCandidates) ||
        ''
    );
}

function normalizeFeedUrl(url: string): string {
    try {
        const parsed = new URL(url.trim());

        if (parsed.hostname === 'feeds.feedburner.com' || parsed.hostname === 'feedburner.google.com') {
            parsed.searchParams.set('format', 'xml');
            if (!parsed.searchParams.has('fmt')) parsed.searchParams.set('fmt', 'xml');

            if (parsed.pathname === '/' || parsed.pathname === '') {
                parsed.pathname = `/feeds/${parsed.hostname.split('.').reverse().join('/')}`;
            }
        }

        return parsed.toString();
    } catch {
        return url.trim();
    }
}

function withFormatParam(url: string, key: string): string {
    try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has(key)) {
            parsed.searchParams.set(key, 'xml');
            return parsed.toString();
        }
    } catch {
        return url;
    }
    return url;
}

function buildFeedUrlVariants(url: string): string[] {
    const variants = new Set<string>();
    const normalized = normalizeFeedUrl(url);
    variants.add(normalized);

    variants.add(withFormatParam(normalized, 'format'));
    variants.add(withFormatParam(normalized, 'fmt'));

    const trimmedTrailingSlash = normalized.replace(/\/+$/, '');
    variants.add(withFormatParam(trimmedTrailingSlash, 'format'));

    try {
        const flipped = new URL(normalized);
        flipped.protocol = flipped.protocol === 'https:' ? 'http:' : 'https:';
        variants.add(flipped.toString());
    } catch {
        // ignore malformed URLs when flipping protocol
    }

    return Array.from(variants);
}

export async function fetchFeed(url: string, maxRetries = 2, forceRefresh = false) {
    let lastError: any;
    const candidates = buildFeedUrlVariants(url);

    for (const candidate of candidates) {
        let candidateError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const proxyUrl = `/api/fetch-feed?url=${encodeURIComponent(candidate)}${forceRefresh ? '&refresh=true' : ''}`;

            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                let text = await response.text();
                // Pre-process malformed XML before parsing
                text = cleanupMalformedXML(text);
                
                try {
                    const feedData = await parser.parseString(text);
                    return feedData;
                } catch (parseErr) {
                    // Log detailed parse error and first 500 chars of cleaned XML
                    console.warn(`Parse error for ${candidate}:`, parseErr);
                    console.log(`Cleaned XML (first 500 chars): ${text.substring(0, 500)}`);
                    throw parseErr;
                }
            } catch (e) {
                candidateError = e;
                lastError = e;
                const isRetryable = e instanceof TypeError || (e as any).message?.includes('HTTP');
                if (attempt < maxRetries && isRetryable) {
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); // Exponential backoff
                    continue;
                }
                break;
            }
        }

        if (!candidateError) break;
    }
    
    console.error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`, lastError);
    throw lastError;
}

export async function syncFeed(feed: Feed, unreadLimit = 50, forceRefresh = false) {
    try {
        const data = await fetchFeed(feed.url, 2, forceRefresh);
        
        // Update Feed Metadata
        await db.feeds.update(feed.id!, {
            title: feed.title || data.title || 'Unknown Feed',
            lastFetched: Date.now(),
            error: undefined
        });

        // Process all articles (convert to Article objects first)
        const processedArticles: Article[] = data.items.map(item => {
            const contentRaw = item['content:encoded'] || item.content || item.summary || '';
            const cleanContent = sanitize(contentRaw);
            const resolvedLink = resolveItemLink(item, feed);
            
            return {
                feedId: feed.id!,
                guid: item.guid || item.link || item.title || Math.random().toString(),
                title: item.title || 'Untitled',
                link: resolvedLink,
                content: cleanContent,
                snippet: cleanContent.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...',
                author: item.creator || item['dc:creator'],
                isoDate: item.isoDate || new Date().toISOString(),
                receivedDate: Date.now(),
                read: 0,
                starred: 0,
                words: tokenize(`${item.title || ''} ${cleanContent}`)
            };
        });

        // Efficiently filter for NEW articles (check keys only)
        // This avoids loading full article content for entire history
        const incomingGuids = processedArticles.map(a => a.guid);
        
        // Find which of these GUIDs already exist for this feed
        const existingGuidsSet = new Set<string>();
        
        // Use the compound index to find matching records but only select the 'guid' field.
        const existingRecords = await db.articles
            .where('[feedId+guid]')
            .anyOf(incomingGuids.map(g => [feed.id!, g]))
            .toArray();
            
        existingRecords.forEach(r => existingGuidsSet.add(r.guid));

        // Backfill missing links on existing articles when we can now resolve them
        const existingByGuid = new Map(existingRecords.map(r => [r.guid, r]));
        const articlesNeedingLinkUpdate = processedArticles.filter(a => {
            const existing = existingByGuid.get(a.guid);
            return existing && (!existing.link || existing.link.trim() === '') && a.link;
        });

        if (articlesNeedingLinkUpdate.length > 0) {
            await Promise.all(
                articlesNeedingLinkUpdate.map(article =>
                    db.articles.where('[feedId+guid]').equals([feed.id!, article.guid]).modify({ link: article.link })
                )
            );
        }

        const newArticles = processedArticles.filter(
            a => !existingGuidsSet.has(a.guid)
        );

        // Auto-Archive Strategy:
        // 1. Sort by date (newest first)
        // 2. Top 50: Mark as unread (visible in inbox)
        // 3. Rest: Mark as read (auto-archived)
        const articlesSortedByDate = newArticles.sort((a, b) => {
            const dateA = new Date(a.isoDate).getTime();
            const dateB = new Date(b.isoDate).getTime();
            return dateB - dateA; // Newest first
        });

        const unreadArticles = articlesSortedByDate
            .slice(0, unreadLimit)
            .map(a => ({ ...a, read: 0 as const })); // Mark as unread

        const archivedArticles = articlesSortedByDate
            .slice(unreadLimit)
            .map(a => ({ ...a, read: 1 as const })); // Mark as read (auto-archived)

        const allNewArticles = [...unreadArticles, ...archivedArticles];

        // Bulk insert (optimized for large batches)
        if (allNewArticles.length > 0) {
            await db.articles.bulkAdd(allNewArticles);
        }

        return {
            unread: unreadArticles.length,
            archived: archivedArticles.length,
            total: allNewArticles.length
        };
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
    const concurrency = 3;
    const results: PromiseSettledResult<{ unread: number; archived: number; total: number }>[] = [];
    
    try {
        // Queue-based concurrency control
        const queue = [...feeds];
        let completed = 0;
        
        refreshProgress.set({ completed: 0, total: feeds.length });
        
        const worker = async () => {
            while (queue.length > 0) {
                const feed = queue.shift();
                if (!feed) return;
                
                try {
                    const result = await syncFeed(feed);
                    results.push({ status: 'fulfilled', value: result });
                } catch (err) {
                    results.push({ status: 'rejected', reason: err });
                }
                
                completed++;
                refreshProgress.set({ completed, total: feeds.length });
            }
        };
        
        // Start concurrency workers
        const workers = Array(Math.min(concurrency, feeds.length))
            .fill(null)
            .map(() => worker());
        
        await Promise.all(workers);
        return results;
    } finally {
        refreshProgress.set(null);
    }
}
