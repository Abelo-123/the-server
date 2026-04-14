/**
 * GodOfPanel (GOP) API Wrapper
 * 
 * Centralized fetcher with an intelligent Cache-Layer.
 * Prevents waiting for slow API responses by serving stale data if needed.
 */

let cache = { services: [], timestamp: 0 };

/**
 * Fetches services from GodOfPanel with caching.
 * Cache remains valid for 10 minutes. If the API is down or slow,
 * it returns the last successful fetch (stale-while-revalidate pattern).
 * 
 * @returns {Promise<Array>} List of services
 */
export async function getServicesCached() {
    const now = Date.now();
    const CACHE_TTL = 600000; // 10 minutes

    // 1. Return fresh cache if available
    if (cache.services.length > 0 && (now - cache.timestamp) < CACHE_TTL) {
        return cache.services;
    }

    // 2. Try to fetch from provider
    try {
        const apiKey = process.env.GODOFPANEL_API_KEY;
        if (!apiKey) {
            console.error('[gop] GODOFPANEL_API_KEY is missing');
            return cache.services;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(`https://godofpanel.com/api/v2?key=${apiKey}&action=services`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (Array.isArray(data)) {
            cache = { services: data, timestamp: now };
            return data;
        } else if (data.error) {
            console.error('[gop] Provider Error:', data.error);
        }
    } catch (e) {
        console.error('[gop] API Error, serving stale cache:', e.message);
    }

    // 3. Fallback to stale cache if API failed
    return cache.services;
}

/**
 * Force clear the cache
 */
export function clearGopCache() {
    cache = { services: [], timestamp: 0 };
}
