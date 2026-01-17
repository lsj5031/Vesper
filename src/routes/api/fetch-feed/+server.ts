import { error as httpError, isHttpError } from '@sveltejs/kit';
import { XMLParser } from 'fast-xml-parser';
import type { RequestHandler } from './$types';
import { API_CONFIG, RSS_CONFIG } from '$lib/config';
import { logger } from '$lib/logger';

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

function toArray<T>(value: T | T[] | undefined): T[] {
    if (Array.isArray(value)) return value;
    return value !== undefined ? [value] : [];
}

function parseDate(value: any): string | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function normalizeFeed(text: string) {
    const parsed = xmlParser.parse(cleanupMalformedXml(text));
    const channel = parsed?.rss?.channel || parsed?.feed || parsed?.rdf;
    const root = Array.isArray(channel) ? channel[0] : channel || {};

    const itemsRaw = root.item || root.entry || [];
    const items = toArray<any>(itemsRaw).map((item) => {
        const linkValue = item.link;
        const link =
            typeof linkValue === 'string'
                ? linkValue
                : Array.isArray(linkValue)
                    ? (linkValue.find((l: any) => typeof l === 'string') ||
                        linkValue.find((l: any) => typeof l?.href === 'string')?.href ||
                        linkValue[0])
                    : typeof linkValue === 'object' && linkValue
                        ? linkValue.href || linkValue._ || ''
                        : '';

        const contentEncoded =
            item['content:encoded'] ??
            (typeof item.content === 'object' ? item.content?.['#text'] ?? item.content?.['$text'] ?? item.content?.['cdata'] : undefined) ??
            item.content;

        const summary =
            item.description ??
            (typeof item.summary === 'object' ? item.summary?.['#text'] ?? item.summary?.['$text'] : item.summary) ??
            '';

        const pubDate = item.pubDate || item.published || item.updated;
        const isoDate = parseDate(item.isoDate || pubDate);

        return {
            title: item.title?.['#text'] ?? item.title ?? '',
            link,
            guid: item.guid?.['#text'] ?? item.guid ?? '',
            pubDate: pubDate ?? '',
            isoDate: isoDate ?? '',
            'content:encoded': typeof contentEncoded === 'string' ? contentEncoded : '',
            content: typeof contentEncoded === 'string' ? contentEncoded : summary,
            summary,
            'dc:creator': item['dc:creator'] ?? item.creator ?? item.author ?? '',
            author: item.author ?? item['dc:creator'] ?? ''
        };
    });

    return {
        title: root.title?.['#text'] ?? root.title ?? '',
        link: root.link?.['#text'] ?? root.link ?? '',
        description: root.description ?? root.subtitle ?? '',
        items
    };
}

export const GET: RequestHandler = async ({ url }) => {
    const feedUrl = url.searchParams.get('url');
    const refresh = url.searchParams.get('refresh') === 'true';
    
    if (!feedUrl) {
        throw httpError(400, 'Missing url parameter');
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
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        };

        if (!refresh) {
            headers['Cache-Control'] = `max-age=${API_CONFIG.CACHE_MAX_AGE}`;
        } else {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        }

        return new Response(JSON.stringify(feedData), { headers });
    } catch (err: any) {
        if (isHttpError(err) || (err?.location && typeof err?.status === 'number')) {
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
