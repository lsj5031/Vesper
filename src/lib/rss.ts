import DOMPurify from 'dompurify';
import { db, type Feed, type Article } from './db';
import { tokenize } from './search';
import { refreshProgress } from './stores';

const FEED_PROXY_BASE = (import.meta.env.VITE_FEED_PROXY_BASE || '').trim();
const REFRESH_ALL_MIN_INTERVAL_MS = 3 * 60 * 1000;
const inFlightFeedRequests = new Map<string, Promise<any>>();
const feedFailureState = new Map<string, { count: number; nextAllowed: number }>();
let lastRefreshAllAt = 0;

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

function buildFeedUrlVariants(url: string): string[] {
    const variants = new Set<string>();
    const normalized = normalizeFeedUrl(url);
    variants.add(normalized);

    const trimmedTrailingSlash = normalized.replace(/\/+$/, '');
    variants.add(trimmedTrailingSlash);

    try {
        const flipped = new URL(normalized);
        flipped.protocol = flipped.protocol === 'https:' ? 'http:' : 'https:';
        variants.add(flipped.toString());
    } catch {
        // ignore malformed URLs when flipping protocol
    }

    return Array.from(variants);
}

function buildProxyUrls(targetUrl: string, forceRefresh: boolean): string[] {
    const params = `?url=${encodeURIComponent(targetUrl)}${forceRefresh ? '&refresh=true' : ''}`;
    
    // Use explicit FEED_PROXY_BASE or default to current origin's /api/fetch-feed
    const proxyBase = FEED_PROXY_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = proxyBase ? `${proxyBase.replace(/\/+$/, '')}/api/fetch-feed${params}` : '';
    
    return url ? [url] : [];
}

function looksLikeHtml(text: string, contentType: string | null): boolean {
    if (contentType && contentType.toLowerCase().includes('text/html')) return true;
    const trimmed = text.trimStart().toLowerCase();
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

export async function fetchFeed(
    url: string,
    maxRetries = 2,
    forceRefresh = false
) {
    const cacheKey = normalizeFeedUrl(url);

    // De-duplicate in-flight requests for the same feed unless explicitly forcing
    if (!forceRefresh && inFlightFeedRequests.has(cacheKey)) {
        return inFlightFeedRequests.get(cacheKey)!;
    }

    const task = (async () => {
        let lastError: any;
        const candidates = buildFeedUrlVariants(url);

        for (const candidate of candidates) {
            let candidateError: any;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                const proxyUrls = buildProxyUrls(candidate, forceRefresh);

                try {
                    for (const proxyUrl of proxyUrls) {
                        try {
                            const response = await fetch(proxyUrl);
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            
                            let text = await response.text();
                            if (looksLikeHtml(text, response.headers.get('content-type'))) {
                                throw new Error('Proxy returned HTML (feed proxy likely missing in production)');
                            }

                            // Parse via server-side API
                             const feedData = JSON.parse(text);
                             return feedData;
                        } catch (proxyErr) {
                            candidateError = proxyErr;
                            lastError = proxyErr;
                            continue;
                        }
                    }
                } catch (e) {
                    candidateError = e;
                    lastError = e;
                }

                const isRetryable = candidateError instanceof TypeError || (candidateError as any)?.message?.includes('HTTP');
                if (attempt < maxRetries && isRetryable) {
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); // Exponential backoff
                    continue;
                }
                break;
            }

            if (!candidateError) break;
        }
        
        console.error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`, lastError);
        throw lastError;
    })();

    inFlightFeedRequests.set(cacheKey, task);
    try {
        return await task;
    } finally {
        if (inFlightFeedRequests.get(cacheKey) === task) {
            inFlightFeedRequests.delete(cacheKey);
        }
    }
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
        const processedArticles: Article[] = data.items.map((item: any) => {
            const contentRaw = item['content:encoded'] || item.content || item.summary || '';
            const cleanContent = sanitize(contentRaw);
            const resolvedLink = resolveItemLink(item, feed);
            const commentsLink = typeof (item as any).comments === 'string' ? (item as any).comments : '';
            const guidCandidate = [item.guid, (item as any).id, commentsLink, item.link, item.title].find(
                (candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== ''
            );
            
            return {
                feedId: feed.id!,
                guid: guidCandidate || Math.random().toString(),
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

        // Build lookups for backfilling missing links
        const processedByGuid = new Map<string, Article>();
        const processedByTitle = new Map<string, Article>();

        for (const article of processedArticles) {
            if (!article.link) continue;

            if (!processedByGuid.has(article.guid)) {
                processedByGuid.set(article.guid, article);
            }

            const titleKey = article.title.trim().toLowerCase();
            if (titleKey && !processedByTitle.has(titleKey)) {
                processedByTitle.set(titleKey, article);
            }
        }

        const matchedProcessedGuids = new Set<string>();
        const updatedArticleIds = new Set<number>();

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

            articlesNeedingLinkUpdate.forEach(article => {
                matchedProcessedGuids.add(article.guid);
                const existing = existingByGuid.get(article.guid);
                if (existing?.id !== undefined) updatedArticleIds.add(existing.id);
            });
        }

        // If GUID changed between runs (e.g., we previously fell back to title), attempt a title-based backfill
        const missingLinkRecords = await db.articles
            .where('feedId')
            .equals(feed.id!)
            .and(r => !r.link || r.link.trim() === '')
            .toArray();

        const titleBackfills: { id: number; link: string }[] = [];

        for (const record of missingLinkRecords) {
            if (record.id === undefined || updatedArticleIds.has(record.id)) continue;

            const titleKey = (record.title || '').trim().toLowerCase();
            const match = processedByGuid.get(record.guid) || (titleKey ? processedByTitle.get(titleKey) : undefined);

            if (match?.link && match.link !== record.link) {
                titleBackfills.push({ id: record.id, link: match.link });
                matchedProcessedGuids.add(match.guid);
            }
        }

        if (titleBackfills.length > 0) {
            await Promise.all(titleBackfills.map(update => db.articles.update(update.id, { link: update.link })));
        }

        const newArticles = processedArticles.filter(
            a => !existingGuidsSet.has(a.guid) && !matchedProcessedGuids.has(a.guid)
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

export async function refreshAllFeeds(force = false) {
    const now = Date.now();
    if (!force && now - lastRefreshAllAt < REFRESH_ALL_MIN_INTERVAL_MS) {
        console.info('Skipping refreshAllFeeds: throttled');
        return [];
    }

    lastRefreshAllAt = now;
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

                const key = normalizeFeedUrl(feed.url);
                const failure = feedFailureState.get(key);
                if (!force && failure && Date.now() < failure.nextAllowed) {
                    completed++;
                    refreshProgress.set({ completed, total: feeds.length });
                    continue;
                }
                
                try {
                    const result = await syncFeed(feed, 50, force);
                    feedFailureState.delete(key);
                    results.push({ status: 'fulfilled', value: result });
                } catch (err) {
                    const prevCount = failure?.count ?? 0;
                    const count = prevCount + 1;
                    const backoffMs = Math.min(15 * 60 * 1000, 30_000 * Math.pow(2, count - 1));
                    feedFailureState.set(key, { count, nextAllowed: Date.now() + backoffMs });
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
