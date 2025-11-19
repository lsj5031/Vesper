import { error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const feedUrl = url.searchParams.get('url');
    
    if (!feedUrl) {
        return httpError(400, 'Missing url parameter');
    }
    
    try {
        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': 'Vesper RSS Reader (compatible; +https://github.com/lsj5031/vesper)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
            },
            // Add a timeout to prevent hanging
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
            return httpError(response.status, `Feed returned ${response.status}`);
        }
        
        const text = await response.text();
        
        return new Response(text, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'max-age=3600', // Cache for 1 hour
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (err: any) {
        console.error(`Failed to fetch feed ${feedUrl}:`, err.message);
        
        // Distinguish between timeout and other errors
        if (err.name === 'AbortError') {
            return httpError(504, `Feed request timeout after 10 seconds`);
        }
        
        return httpError(502, `Failed to fetch feed: ${err.message}`);
    }
};
