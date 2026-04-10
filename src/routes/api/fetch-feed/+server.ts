import { error as httpError, isHttpError } from '@sveltejs/kit';
import { XMLParser } from 'fast-xml-parser';
import type { RequestHandler } from './$types';
import { API_CONFIG, RSS_CONFIG } from '$lib/config';
import { logger } from '$lib/logger';

// Simple in-memory rate limiting
const rateLimit = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // Max 30 requests per minute per IP

function isSafeUrl(urlString: string): boolean {
    let parsedUrl;
    try {
        parsedUrl = new URL(urlString);
    } catch {
        return false;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Cloudflare Workers natively block SSRF by restricting fetch() 
    // to standard ports and preventing routing to internal networks.
    // However, we still explicitly block known internal IP formats in the hostname just in case.
    if (
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname === '169.254.169.254'
    ) {
        return false;
    }

    // Block 172.16.0.0/12 explicitly formatted
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
        return false;
    }

    // Block local IPv6 explicitly formatted
    if (hostname.startsWith('fc00:') || hostname.startsWith('fd00:') || hostname.startsWith('fe80:')) {
        return false;
    }

    return true;
}

// Some feeds ship malformed XML (unclosed CDATA, `<link/>http...` fragments, etc.)
// This lightly normalizes common cases so the parser can recover.
function cleanupMalformedXml(xml: string): string {
    let cleaned = xml.replace(/<(link|guid)\s*\/>\s*(https?:\/\/[^\s<]+)/gi, '<$1>$2</$1>');
    cleaned = cleaned.replace(/\]\]\s*>/g, ']]>'); // normalize spaced CDATA endings

    const openCdata = (cleaned.match(/<!\[CDATA\[/g) || []).length;
    const closeCdata = (cleaned.match(/\]\]>/g) || []).length;
    if (openCdata > closeCdata) {
        cleaned += ']]>'.repeat(openCdata - closeCdata);
    }

    return cleaned;
}

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    trimValues: true
});

type XmlRecord = Record<string, unknown>;

type NormalizedFeedItem = {
    title: string;
    link: string;
    guid: string;
    pubDate: string;
    isoDate: string;
    'content:encoded': string;
    content: string;
    summary: string;
    'dc:creator': string;
    author: string;
};

type NormalizedFeed = {
    title: string;
    link: string;
    description: string;
    items: NormalizedFeedItem[];
};

function asRecord(value: unknown): XmlRecord | null {
    return typeof value === 'object' && value !== null ? (value as XmlRecord) : null;
}

function getTextValue(value: unknown): string {
    if (typeof value === 'string') return value;

    const record = asRecord(value);
    if (!record) return '';

    for (const key of ['#text', '$text', 'cdata', '_']) {
        const candidate = record[key];
        if (typeof candidate === 'string') return candidate;
    }

    return '';
}

function getLinkValue(value: unknown): string {
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        for (const entry of value) {
            const link = getLinkValue(entry);
            if (link) return link;
        }
        return '';
    }

    const record = asRecord(value);
    if (!record) return '';

    if (typeof record.href === 'string') return record.href;
    return getTextValue(record);
}

function isRedirectLike(value: unknown): value is { status: number; location: string } {
    const record = asRecord(value);
    return record !== null && typeof record.status === 'number' && typeof record.location === 'string';
}

function toArray<T>(value: T | T[] | undefined): T[] {
    if (Array.isArray(value)) return value;
    return value !== undefined ? [value] : [];
}

function parseDate(value: unknown): string | undefined {
    if (!value) return undefined;

    const dateValue =
        typeof value === 'string' || typeof value === 'number' || value instanceof Date
            ? value
            : getTextValue(value);
    if (!dateValue) return undefined;

    const d = new Date(dateValue);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function normalizeFeed(text: string): NormalizedFeed {
    const parsed = asRecord(xmlParser.parse(cleanupMalformedXml(text))) ?? {};
    const rss = asRecord(parsed.rss);
    const channel = rss?.channel ?? parsed.feed ?? parsed.rdf;
    const root = (Array.isArray(channel) ? asRecord(channel[0]) : asRecord(channel)) ?? {};

    const itemsRaw = root.item || root.entry || [];
    const items = toArray(itemsRaw).map((itemRaw): NormalizedFeedItem => {
        const item = asRecord(itemRaw) ?? {};
        const linkValue = item.link;
        const link = getLinkValue(linkValue);

        const contentEncoded =
            item['content:encoded'] ??
            (asRecord(item.content)?.['#text'] ??
                asRecord(item.content)?.['$text'] ??
                asRecord(item.content)?.['cdata']) ??
            item.content;

        const summary =
            item.description ??
            (asRecord(item.summary)?.['#text'] ?? asRecord(item.summary)?.['$text']) ??
            item.summary ??
            '';
        const summaryText = typeof summary === 'string' ? summary : '';
        const contentText = typeof contentEncoded === 'string' ? contentEncoded : summaryText;

        const pubDate = item.pubDate || item.published || item.updated;
        const isoDate = parseDate(item.isoDate || pubDate);

        return {
            title: getTextValue(item.title),
            link,
            guid: getTextValue(item.guid) || getTextValue(item.id),
            pubDate: typeof pubDate === 'string' ? pubDate : '',
            isoDate: isoDate ?? '',
            'content:encoded': typeof contentEncoded === 'string' ? contentEncoded : '',
            content: contentText,
            summary: summaryText,
            'dc:creator': getTextValue(item['dc:creator']) || getTextValue(item.creator) || getTextValue(item.author),
            author: getTextValue(item.author) || getTextValue(item['dc:creator'])
        };
    });

    return {
        title: getTextValue(root.title),
        link: getLinkValue(root.link),
        description: getTextValue(root.description) || getTextValue(root.subtitle),
        items
    };
}

export const GET: RequestHandler = async ({ url, getClientAddress, request }) => {
    // 1. Rate Limiting Check
    try {
        const ip = getClientAddress();
        const now = Date.now();
        const entry = rateLimit.get(ip);
        if (!entry || entry.resetTime < now) {
            rateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        } else if (entry.count >= RATE_LIMIT_MAX) {
            throw httpError(429, 'Too many requests');
        } else {
            entry.count++;
        }
    } catch (e) {
        // getClientAddress might throw if adapter-node is misconfigured, fail open but warn
        if (isHttpError(e)) throw e;
        logger.warn('Could not determine client IP for rate limiting');
    }

    const feedUrl = url.searchParams.get('url');
    const refresh = url.searchParams.get('refresh') === 'true';

    if (!feedUrl) {
        throw httpError(400, 'Missing url parameter');
    }

    // 2. SSRF Protection
    if (!isSafeUrl(feedUrl)) {
        logger.warn(`[fetch-feed] Blocked attempt to fetch unsafe URL: ${feedUrl}`);
        throw httpError(403, 'Fetching this URL is forbidden for security reasons.');
    }

    try {
        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.9',
                ...(refresh ? { 'Cache-Control': 'no-cache' } : {})
            },
            signal: AbortSignal.timeout(RSS_CONFIG.FETCH_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw httpError(response.status, `Feed returned ${response.status}`);
        }

        const text = await response.text();
        let feedData;
        try {
            feedData = normalizeFeed(text);
        } catch (parseErr: unknown) {
            logger.error(`Parse error for ${feedUrl}`, parseErr, 'fetch-feed');
            throw httpError(502, `Failed to parse feed: ${parseErr instanceof Error ? parseErr.message : 'Unknown error'}`);
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json; charset=utf-8'
        };

        // 3. CORS Protection
        const requestOrigin = request.headers.get('origin');
        if (requestOrigin) {
            const allowedOrigins = ['http://localhost:5173', 'http://localhost:4173', url.origin];
            if (allowedOrigins.includes(requestOrigin) || requestOrigin.startsWith('tauri://') || requestOrigin.startsWith('file://')) {
                headers['Access-Control-Allow-Origin'] = requestOrigin;
            }
        }

        if (!refresh) {
            headers['Cache-Control'] = `max-age=${API_CONFIG.CACHE_MAX_AGE}`;
        } else {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        }

        return new Response(JSON.stringify(feedData), { headers });
    } catch (err: unknown) {
        if (isHttpError(err) || isRedirectLike(err)) {
            throw err;
        }

        const message = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : undefined;

        logger.error(`Failed to fetch feed ${feedUrl}`, err, 'fetch-feed');

        if (name === 'AbortError' || name === 'TimeoutError') {
            throw httpError(504, `Feed request timeout after ${RSS_CONFIG.FETCH_TIMEOUT_MS / 1000} seconds`);
        }

        throw httpError(502, `Failed to fetch feed: ${message}`);
    }
};
