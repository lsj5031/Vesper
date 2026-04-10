// Cloudflare Pages Function to proxy RSS/Atom feeds (bypasses CORS for the SPA)
const MAX_BYTES = 2 * 1024 * 1024; // hard cap returned payloads to 2MB
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '').trim();

function isPrivateHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower === 'ip6-localhost') return true;
    if (lower === '127.0.0.1' || lower === '::1') return true;
    if (lower.startsWith('127.') || lower.startsWith('10.') || lower.startsWith('192.168.') || lower.startsWith('169.254.')) return true;
    if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
    return false;
}

export const onRequest: PagesFunction = async ({ request }) => {
    const url = new URL(request.url);
    const feedUrl = url.searchParams.get('url');
    const refresh = url.searchParams.get('refresh') === 'true';

    if (!feedUrl) {
        return new Response('Missing url parameter', { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(feedUrl);
    } catch {
        return new Response('Invalid url parameter', { status: 400 });
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
        return new Response('Only http/https allowed', { status: 400 });
    }

    if (isPrivateHost(target.hostname)) {
        return new Response('Target host is not allowed', { status: 403 });
    }

    try {
        const response = await fetch(target.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.9',
                ...(refresh ? { 'Cache-Control': 'no-cache' } : {})
            },
            // Abort if upstream hangs
            signal: AbortSignal.timeout(10000),
            // Edge cache for an hour unless force-refreshing
            cf: refresh ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: 3600, cacheEverything: true }
        });

        if (!response.ok) {
            return new Response(`Feed returned ${response.status}`, { status: response.status });
        }

        // Reject oversized payloads early if Content-Length provided
        const lengthHeader = response.headers.get('content-length');
        if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
            return new Response('Feed too large', { status: 413 });
        }

        // Stream body with a hard cap
        const reader = response.body?.getReader();
        if (!reader) {
            return new Response('Upstream response unreadable', { status: 502 });
        }

        let received = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                received += value.byteLength;
                if (received > MAX_BYTES) {
                    reader.cancel();
                    return new Response('Feed too large', { status: 413 });
                }
                chunks.push(value);
            }
        }

        const textDecoder = new TextDecoder('utf-8');
        const text = chunks.map(chunk => textDecoder.decode(chunk, { stream: false })).join('');

        const headers: Record<string, string> = {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN || request.headers.get('origin') || '*',
            'Vary': 'Origin',
            ...(refresh ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : { 'Cache-Control': 'max-age=3600' })
        };

        return new Response(text, { status: 200, headers });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : undefined;

        console.error(`Failed to fetch feed ${feedUrl}:`, message);

        if (name === 'AbortError') {
            return new Response('Feed request timeout after 10 seconds', { status: 504 });
        }

        return new Response(`Failed to fetch feed: ${message}`, { status: 502 });
    }
};
