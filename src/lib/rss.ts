import DOMPurify from "dompurify";
import { db, type Feed, type Article, type ArticleBody } from "./db";
import { tokenize } from "./search";
import { refreshProgress } from "./stores";
import { get } from "svelte/store";
import { logger } from "./logger";

import { RSS_CONFIG, ARTICLE_CONFIG } from "./config";
import { userSettings } from "./stores";

type UserSettings = {
    useDirectFetch?: boolean;
};

type PreparedArticle = {
    guid: string;
    title: string;
    link: string;
    contentRaw: string;
    author?: string;
    isoDate: string;
    receivedDate: number;
};

type ParsedFeedLinkObject = {
    href?: string;
};

type ParsedFeedItem = {
    title?: string;
    link?: string | ParsedFeedLinkObject | Array<string | ParsedFeedLinkObject>;
    guid?: string;
    id?: string;
    comments?: string;
    summary?: string;
    content?: string;
    "content:encoded"?: string;
    "dc:creator"?: string;
    creator?: string;
    author?: string;
    isoDate?: string;
    pubDate?: string;
};

type ParsedFeed = {
    title: string;
    link: string;
    description: string;
    items: ParsedFeedItem[];
};

const FEED_PROXY_BASE = (import.meta.env.VITE_FEED_PROXY_BASE || "").trim();
const inFlightFeedRequests = new Map<string, Promise<ParsedFeed>>();
const feedFailureState = new Map<string, { count: number; nextAllowed: number }>();
let lastRefreshAllAt = 0;

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error";
}

// Initialize DOMPurify (needs window context, so check for browser)
let sanitize = (html: string) => html;
if (typeof window !== "undefined") {
    sanitize = (html: string) =>
        DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                "b",
                "i",
                "em",
                "strong",
                "a",
                "p",
                "br",
                "ul",
                "ol",
                "li",
                "blockquote",
                "img",
                "h1",
                "h2",
                "h3",
                "h4",
                "code",
                "pre",
            ],
            ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target"],
        });
}

function resolveUrl(candidate: string, bases: string[]): string {
    const trimmed = candidate.trim();
    if (!trimmed) return "";

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

    return "";
}

function resolveItemLink(item: ParsedFeedItem, feed: Feed): string {
    const baseCandidates = [feed.website, feed.url].filter(Boolean) as string[];

    const linkCandidate = Array.isArray(item.link) ? item.link[0] : item.link;
    const linkObject =
        typeof linkCandidate === "object" && linkCandidate !== null ? linkCandidate : undefined;
    // rss-parser sometimes returns Atom links as objects with href
    const rawLink =
        typeof linkCandidate === "string" && linkCandidate
            ? linkCandidate
            : typeof linkObject?.href === "string"
              ? linkObject.href
              : "";

    const guidCandidate = typeof item.guid === "string" ? item.guid : "";

    return resolveUrl(rawLink, baseCandidates) || resolveUrl(guidCandidate, baseCandidates) || "";
}

function normalizeFeedUrl(url: string): string {
    try {
        const parsed = new URL(url.trim());

        if (
            parsed.hostname === "feeds.feedburner.com" ||
            parsed.hostname === "feedburner.google.com"
        ) {
            parsed.searchParams.set("format", "xml");
            if (!parsed.searchParams.has("fmt")) parsed.searchParams.set("fmt", "xml");

            if (parsed.pathname === "/" || parsed.pathname === "") {
                parsed.pathname = `/feeds/${parsed.hostname.split(".").reverse().join("/")}`;
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

    const trimmedTrailingSlash = normalized.replace(/\/+$/, "");
    variants.add(trimmedTrailingSlash);

    try {
        const flipped = new URL(normalized);
        flipped.protocol = flipped.protocol === "https:" ? "http:" : "https:";
        variants.add(flipped.toString());
    } catch {
        // ignore malformed URLs when flipping protocol
    }

    return Array.from(variants);
}

function buildProxyUrls(targetUrl: string, forceRefresh: boolean): string[] {
    const params = `?url=${encodeURIComponent(targetUrl)}${forceRefresh ? "&refresh=true" : ""}`;

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const isFileOrigin = origin.startsWith("file:");
    const proxyBase = FEED_PROXY_BASE || (!isFileOrigin ? origin : "");
    const url = proxyBase ? `${proxyBase.replace(/\/+$/, "")}/api/fetch-feed${params}` : "";

    return url ? [url] : [];
}

function looksLikeHtml(text: string, contentType: string | null): boolean {
    if (contentType && contentType.toLowerCase().includes("text/html")) return true;
    const trimmed = text.trimStart().toLowerCase();
    return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

// Parse RSS/Atom feed directly from XML (client-side)
function parseFeedXml(xmlText: string): ParsedFeed {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for parser errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        throw new Error("Invalid XML format");
    }

    const rssChannel = xmlDoc.querySelector("channel");
    const atomFeed = xmlDoc.querySelector("feed");
    const rdfChannel = xmlDoc.querySelector("rdf\\:channel, channel");

    const channel = rssChannel || atomFeed || rdfChannel;

    if (!channel) {
        throw new Error("No feed channel found");
    }

    const title = channel.querySelector("title")?.textContent || "";
    const link =
        channel.querySelector("link")?.textContent ||
        channel.querySelector('link[rel="alternate"]')?.getAttribute("href") ||
        "";
    const description = channel.querySelector("description, subtitle")?.textContent || "";

    const items = Array.from(channel.querySelectorAll("item, entry")).map((item) => {
        const itemTitle = item.querySelector("title")?.textContent || "";
        const itemLink =
            item.querySelector("link")?.textContent ||
            item.querySelector('link[rel="alternate"]')?.getAttribute("href") ||
            item.querySelector("guid")?.textContent ||
            "";
        const guid =
            item.querySelector("guid")?.textContent || item.querySelector("id")?.textContent || "";
        const content =
            item.querySelector("content\\:encoded, content, description")?.textContent || "";
        const summary = item.querySelector("description, summary")?.textContent || "";
        const pubDate = item.querySelector("pubDate, published, updated")?.textContent || "";
        const creator = item.querySelector("creator, dc\\:creator, author")?.textContent || "";

        // Parse date to ISO format
        let isoDate = "";
        if (pubDate) {
            const d = new Date(pubDate);
            if (!Number.isNaN(d.getTime())) {
                isoDate = d.toISOString();
            }
        }

        return {
            title: itemTitle,
            link: itemLink,
            guid,
            "content:encoded": content,
            content: content || summary,
            summary,
            pubDate,
            isoDate: isoDate || new Date().toISOString(),
            "dc:creator": creator,
            author: creator,
        };
    });

    return {
        title,
        link,
        description,
        items,
    };
}

// Direct client-side fetch (bypasses proxy, handles CORS)
async function fetchFeedDirect(url: string): Promise<ParsedFeed> {
    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.9",
        },
        signal: AbortSignal.timeout(RSS_CONFIG.FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    // Check if we got HTML instead of XML (likely CORS error or blocked)
    if (looksLikeHtml(text, response.headers.get("content-type"))) {
        throw new Error(`CORS_BLOCKED`);
    }

    // Parse the XML feed
    return parseFeedXml(text);
}

export async function fetchFeed(
    url: string,
    maxRetries = RSS_CONFIG.MAX_FETCH_RETRIES,
    forceRefresh = false,
    overrideUseDirectFetch?: boolean
): Promise<ParsedFeed> {
    const cacheKey = normalizeFeedUrl(url);

    // De-duplicate in-flight requests for the same feed unless explicitly forcing
    if (!forceRefresh && inFlightFeedRequests.has(cacheKey)) {
        return inFlightFeedRequests.get(cacheKey)!;
    }

    const task = (async (): Promise<ParsedFeed> => {
        let lastError: unknown;
        const candidates = buildFeedUrlVariants(url);

        // Check if user prefers direct fetch mode (for desktop apps without server)
        // Allow override for immediate retry after enabling Direct Fetch Mode
        const settings: UserSettings = typeof window !== "undefined" ? get(userSettings) : {};
        const useDirectFetch = overrideUseDirectFetch ?? settings.useDirectFetch ?? false;

        for (const candidate of candidates) {
            let candidateError: unknown;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // Try direct fetch first if enabled (works offline, bypasses CORS-capable servers)
                    if (useDirectFetch) {
                        try {
                            logger.info(`Using direct fetch for ${candidate}`, "rss");
                            return await fetchFeedDirect(candidate);
                        } catch (directErr: unknown) {
                            const isCorsBlocked = getErrorMessage(directErr) === "CORS_BLOCKED";

                            if (isCorsBlocked) {
                                logger.warn(
                                    `CORS blocked for ${candidate}, this feed requires a proxy server`,
                                    "rss"
                                );
                                candidateError = new Error(
                                    `This feed provider (${new URL(candidate).hostname}) blocks direct browser access due to CORS policy. ` +
                                        `Switch off "Direct Fetch Mode" in settings to use the proxy, or try a different feed.`
                                );
                            } else {
                                candidateError = directErr;
                            }
                            lastError = candidateError;
                        }
                    } else {
                        // Use proxy (default mode, works with web-deployed app)
                        const proxyUrls = buildProxyUrls(candidate, forceRefresh);

                        if (proxyUrls.length === 0) {
                            candidateError = new Error(
                                "Feed proxy not available. Enable 'Direct Fetch Mode' in Settings to fetch feeds directly, or set VITE_FEED_PROXY_BASE environment variable."
                            );
                            lastError = candidateError;
                            break;
                        }

                        for (const proxyUrl of proxyUrls) {
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(
                                    () => controller.abort(),
                                    RSS_CONFIG.FETCH_TIMEOUT_MS
                                );
                                let response: Response;
                                try {
                                    response = await fetch(proxyUrl, { signal: controller.signal });
                                } finally {
                                    clearTimeout(timeoutId);
                                }
                                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                                const text = await response.text();
                                if (looksLikeHtml(text, response.headers.get("content-type"))) {
                                    throw new Error(
                                        "Proxy returned HTML (feed proxy likely missing in production)"
                                    );
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
                    }
                } catch (e) {
                    candidateError = e;
                    lastError = e;
                }

                const isRetryable =
                    candidateError instanceof TypeError ||
                    getErrorMessage(candidateError).includes("HTTP");
                if (attempt < maxRetries && isRetryable) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, RSS_CONFIG.BACKOFF_BASE_MS * Math.pow(2, attempt))
                    );
                    continue;
                }
                break;
            }

            if (!candidateError) break;
        }

        logger.error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`, lastError, "rss");
        throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
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

export async function syncFeed(
    feed: Feed,
    _unreadLimit = ARTICLE_CONFIG.UNREAD_LIMIT,
    forceRefresh = false,
    overrideUseDirectFetch?: boolean
) {
    try {
        const data = await fetchFeed(feed.url, 2, forceRefresh, overrideUseDirectFetch);
        const nextFeedTitle = feed.title || data.title || "Unknown Feed";
        const syncCompletedAt = Date.now();

        // Keep the first pass cheap so duplicate items do not pay the sanitize/tokenize cost.
        const items = Array.isArray(data.items) ? data.items : [];
        const receivedDate = Date.now();
        const preparedArticlesByGuid = new Map<string, PreparedArticle>();

        for (const item of items) {
            const resolvedLink = resolveItemLink(item, feed);
            const commentsLink = typeof item.comments === "string" ? item.comments : "";
            const guidCandidate = [
                item.guid,
                item.id,
                commentsLink,
                item.link,
                item.title,
            ].find(
                (candidate): candidate is string =>
                    typeof candidate === "string" && candidate.trim() !== ""
            );

            // Stable fallback GUID: derive from link, title+date to avoid duplicates on each sync
            const stableFallbackGuid =
                resolvedLink ||
                `${(item.title ?? "").trim()}|${item.isoDate ?? ""}|${feed.id ?? ""}`;
            const guid = guidCandidate || stableFallbackGuid;

            if (preparedArticlesByGuid.has(guid)) continue;

            preparedArticlesByGuid.set(guid, {
                guid,
                title: item.title || "Untitled",
                link: resolvedLink,
                contentRaw: item["content:encoded"] || item.content || item.summary || "",
                author: item.creator || item["dc:creator"],
                isoDate: item.isoDate || new Date().toISOString(),
                receivedDate,
            });
        }

        const preparedArticles = Array.from(preparedArticlesByGuid.values());

        // Efficiently filter for NEW articles (check keys only)
        // This avoids loading full article content for entire history
        const incomingGuids = Array.from(new Set(preparedArticles.map((a) => a.guid)));

        // Find which of these GUIDs already exist for this feed
        const existingGuidsSet = new Set<string>();

        // Use the compound index and .keys() to only get the compound key tuples (avoids loading full article content)
        const existingKeys = await db.articles
            .where("[feedId+guid]")
            .anyOf(incomingGuids.map((g) => [feed.id!, g]))
            .keys();

        (existingKeys as unknown as [number, string][]).forEach(([, guid]) =>
            existingGuidsSet.add(guid)
        );

        // Build lookups for backfilling missing links
        const preparedByGuid = new Map<string, PreparedArticle>();
        const preparedByTitle = new Map<string, PreparedArticle>();

        for (const article of preparedArticles) {
            if (!article.link) continue;

            if (!preparedByGuid.has(article.guid)) {
                preparedByGuid.set(article.guid, article);
            }

            const titleKey = article.title.trim().toLowerCase();
            if (titleKey && !preparedByTitle.has(titleKey)) {
                preparedByTitle.set(titleKey, article);
            }
        }

        const matchedProcessedGuids = new Set<string>();
        const updatedArticleIds = new Set<number>();
        const articlesNeedingLinkUpdate: PreparedArticle[] = [];

        // Backfill missing links on existing articles when we can now resolve them
        // Only fetch existing records that have a potential link update (processed article has a link)
        const existingGuidsWithNewLinks = Array.from(
            new Set(
                preparedArticles
                    .filter((a) => a.link && existingGuidsSet.has(a.guid))
                    .map((a) => a.guid)
            )
        );

        if (existingGuidsWithNewLinks.length > 0) {
            const existingRecordsForBackfill = await db.articles
                .where("[feedId+guid]")
                .anyOf(existingGuidsWithNewLinks.map((g) => [feed.id!, g]))
                .toArray();

            const existingByGuid = new Map(existingRecordsForBackfill.map((r) => [r.guid, r]));
            articlesNeedingLinkUpdate.push(
                ...preparedArticles.filter((a) => {
                    const existing = existingByGuid.get(a.guid);
                    return existing && (!existing.link || existing.link.trim() === "") && a.link;
                })
            );

            if (articlesNeedingLinkUpdate.length > 0) {
                articlesNeedingLinkUpdate.forEach((article) => {
                    matchedProcessedGuids.add(article.guid);
                    const existing = existingByGuid.get(article.guid);
                    if (existing?.id !== undefined) updatedArticleIds.add(existing.id);
                });
            }
        }

        const titleBackfills: { id: number; link: string }[] = [];

        if (preparedByGuid.size > 0 || preparedByTitle.size > 0) {
            // Only scan existing records when the latest fetch can actually supply a missing link.
            const missingLinkRecords = await db.articles
                .where("feedId")
                .equals(feed.id!)
                .and((r) => !r.link || r.link.trim() === "")
                .toArray();

            for (const record of missingLinkRecords) {
                if (record.id === undefined || updatedArticleIds.has(record.id)) continue;

                const titleKey = (record.title || "").trim().toLowerCase();
                const match =
                    preparedByGuid.get(record.guid) ||
                    (titleKey ? preparedByTitle.get(titleKey) : undefined);

                if (match?.link && match.link !== record.link) {
                    titleBackfills.push({ id: record.id, link: match.link });
                    matchedProcessedGuids.add(match.guid);
                }
            }
        }

        if (titleBackfills.length > 0) {
            await Promise.all(
                titleBackfills.map((update) => db.articles.update(update.id, { link: update.link }))
            );
        }

        const newArticles = preparedArticles.filter(
            (a) => !existingGuidsSet.has(a.guid) && !matchedProcessedGuids.has(a.guid)
        );

        const newArticleContentByGuid = new Map<string, string>();
        const allNewArticles: Article[] = newArticles.map((article) => {
            const cleanContent = sanitize(article.contentRaw);
            const snippetText = cleanContent.replace(/<[^>]*>?/gm, "");
            newArticleContentByGuid.set(article.guid, cleanContent);

            return {
                feedId: feed.id!,
                guid: article.guid,
                title: article.title,
                link: article.link,
                snippet:
                    snippetText.length > ARTICLE_CONFIG.SNIPPET_LENGTH
                        ? snippetText.substring(0, ARTICLE_CONFIG.SNIPPET_LENGTH) + "..."
                        : snippetText,
                author: article.author,
                isoDate: article.isoDate,
                receivedDate: article.receivedDate,
                read: 0,
                starred: 0,
                words: tokenize(`${article.title} ${cleanContent}`),
            };
        });

        await db.transaction("rw", db.feeds, db.articles, db.articleBodies, async () => {
            await db.feeds.update(feed.id!, {
                title: nextFeedTitle,
                lastFetched: syncCompletedAt,
                error: undefined,
            });

            for (const article of articlesNeedingLinkUpdate) {
                await db.articles
                    .where("[feedId+guid]")
                    .equals([feed.id!, article.guid])
                    .modify({ link: article.link });
            }

            for (const update of titleBackfills) {
                await db.articles.update(update.id, { link: update.link });
            }

            if (allNewArticles.length > 0) {
                await db.articles.bulkAdd(allNewArticles);

                const insertedArticles = await db.articles
                    .where("[feedId+guid]")
                    .anyOf(allNewArticles.map((article) => [feed.id!, article.guid]))
                    .toArray();

                const articleBodies: ArticleBody[] = insertedArticles
                    .filter((article): article is Article & { id: number } => article.id !== undefined)
                    .map((article) => ({
                        articleId: article.id,
                        feedId: article.feedId,
                        content: newArticleContentByGuid.get(article.guid) ?? "",
                    }));

                if (articleBodies.length > 0) {
                    await db.articleBodies.bulkPut(articleBodies);
                }
            }
        });

        return {
            unread: allNewArticles.length,
            archived: 0,
            total: allNewArticles.length,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await db.feeds.update(feed.id!, { error: message });
        throw err;
    }
}

export async function addNewFeed(url: string, folderId?: number) {
    const normalizedUrl = normalizeFeedUrl(url);
    const existingFeed = await db.feeds.where("url").equals(normalizedUrl).first();
    if (existingFeed) {
        throw new Error(`Feed already exists: ${normalizedUrl}`);
    }

    const data = await fetchFeed(url);

    const feedId = await db.feeds.add({
        url: normalizedUrl,
        title: data.title || new URL(url).hostname,
        website: data.link || url,
        folderId,
        lastFetched: 0,
    });

    // 3. Sync content
    const feed = await db.feeds.get(feedId);
    if (feed) await syncFeed(feed);

    return feedId;
}

export async function refreshAllFeeds(force = false) {
    const now = Date.now();
    if (!force && now - lastRefreshAllAt < RSS_CONFIG.REFRESH_ALL_MIN_INTERVAL_MS) {
        logger.info("Skipping refreshAllFeeds: throttled", "rss");
        return [];
    }

    lastRefreshAllAt = now;
    const feeds = await db.feeds.toArray();
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
                    results.push({ status: "fulfilled", value: result });
                } catch (err) {
                    const prevCount = failure?.count ?? 0;
                    const count = prevCount + 1;
                    const backoffMs = Math.min(
                        RSS_CONFIG.MAX_BACKOFF_MS,
                        RSS_CONFIG.BACKOFF_BASE_MS * 60 * Math.pow(2, count - 1)
                    );
                    feedFailureState.set(key, { count, nextAllowed: Date.now() + backoffMs });
                    results.push({ status: "rejected", reason: err });
                }

                completed++;
                refreshProgress.set({ completed, total: feeds.length });
            }
        };

        // Start concurrency workers
        const workers = Array(Math.min(RSS_CONFIG.CONCURRENCY, feeds.length))
            .fill(null)
            .map(() => worker());

        await Promise.all(workers);
        return results;
    } finally {
        refreshProgress.set(null);
    }
}
