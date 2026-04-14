/**
 * Get Categories — Direct Fetch from GodOfPanel API
 *
 * GET /api/categories
 * GET /api/categories?platform=instagram
 *
 * Fetches raw service list from godofpanel.com, extracts unique categories.
 * Optionally filters by platform keyword if ?platform= is provided.
 */
import { Router } from 'express';

const router = Router();

// In-memory cache - loaded at startup for instant response
let cachedCategories = [];
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (fetched once at startup)

// Preload categories on server start
async function preloadCategories() {
    const apiKey = process.env.GODOFPANEL_API_KEY;
    if (!apiKey) {
        console.log('[get_categories] No API key, skipping preload');
        return;
    }
    
    try {
        console.log('[get_categories] Preloading categories...');
        
        // Fetch disabled services first
        let disabledServiceIds = new Set();
        try {
            const [disabledRows] = await pool.execute('SELECT service_id FROM service_custom WHERE is_enabled = 0');
            disabledRows.forEach(row => disabledServiceIds.add(row.service_id));
        } catch (e) {
            // Table might not exist yet
        }
        
        let response, rawServices;
        for (let i = 0; i < 3; i++) {
            try {
                response = await fetch(`https://godofpanel.com/api/v2?key=${apiKey}&action=services`);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        rawServices = data;
                        break;
                    }
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!rawServices) throw new Error("GodOfPanel failed after 3 retries");
        
        if (Array.isArray(rawServices)) {
            // Filter disabled services before extracting categories
            const enabledServices = rawServices.filter(s => !disabledServiceIds.has(parseInt(s.service)));
            cachedCategories = [...new Set(enabledServices.map(s => s.category).filter(Boolean))];
            lastCacheTime = Date.now();
            console.log(`[get_categories] Preloaded ${cachedCategories.length} categories (filtered disabled)`);
        }
    } catch(e) {
        console.error('[get_categories] Preload failed:', e.message);
    }
}

// Start preloading immediately
preloadCategories();

// Platform keyword mapping (mirrors frontend PLATFORMS constant)
const PLATFORM_KEYWORDS = {
    instagram: ['instagram', 'ig '],
    tiktok: ['tiktok', 'tik tok'],
    youtube: ['youtube', 'yt '],
    facebook: ['facebook', 'fb '],
    twitter: ['twitter', 'x.com', 'tweet'],
    telegram: ['telegram', 'tg '],
};

router.get('/', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === '1';
        const platform = req.query.platform || null;
        const apiKey = process.env.GODOFPANEL_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'GODOFPANEL_API_KEY not configured' });
        }

        const now = Date.now();
        let allCategories = cachedCategories;

        // Always check DB for latest disabled services
        let disabledServiceIds = new Set();
        try {
            const [disabledRows] = await pool.execute('SELECT service_id FROM service_custom WHERE is_enabled = 0');
            disabledRows.forEach(row => disabledServiceIds.add(row.service_id));
        } catch (e) { /* table may not exist */ }

        // Filter cached categories by current disabled list
        if (cachedCategories.length > 0 && disabledServiceIds.size > 0) {
            // Need to check which categories have any enabled services
            // For cached, we filter at service level - but since categories are precomputed,
            // we return all and let services filter disable
            // The actual filtering happens in getServices
        }

        // Fetch fresh data if cache expired or force refresh
        if (forceRefresh || !allCategories || (now - lastCacheTime) > CACHE_TTL_MS) {
            console.log('[get_categories] Fetching fresh categories from GodOfPanel...');
            
            let response, rawServices, lastProviderError = null;
            for (let i = 0; i < 3; i++) {
                try {
                    response = await fetch(`https://godofpanel.com/api/v2?key=${apiKey}&action=services`);
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data)) {
                            rawServices = data;
                            break;
                        } else if (data.error) {
                            lastProviderError = data.error;
                        }
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!rawServices) {
                if (lastProviderError) {
                    console.error('[get_categories] Provider Error:', lastProviderError);
                    return res.status(502).json({ error: lastProviderError });
                }
                throw new Error('Invalid response format or provider timeout after 3 retries');
            }

            // Extract unique category names (filter disabled services)
            let disabledServiceIds = new Set();
            try {
                const [disabledRows] = await pool.execute('SELECT service_id FROM service_custom WHERE is_enabled = 0');
                disabledRows.forEach(row => disabledServiceIds.add(row.service_id));
            } catch (e) { /* table may not exist */ }
            
            const enabledServices = rawServices.filter(s => !disabledServiceIds.has(parseInt(s.service)));
            allCategories = [...new Set(
                enabledServices
                    .map(svc => svc.category)
                    .filter(Boolean)
            )];

            // Update cache
            cachedCategories = allCategories;
            lastCacheTime = now;
            
            console.log(`[get_categories] Cached ${allCategories.length} unique categories`);
        }

        // Filter by platform if requested
        let result = allCategories;
        if (platform && platform !== 'top') {
            const keywords = PLATFORM_KEYWORDS[platform];
            
            if (platform === 'other') {
                // "Other" = everything NOT matching any major platform
                const allMajorKeywords = Object.values(PLATFORM_KEYWORDS).flat();
                result = allCategories.filter(cat => {
                    const lower = cat.toLowerCase();
                    return !allMajorKeywords.some(kw => lower.includes(kw));
                });
            } else if (keywords) {
                result = allCategories.filter(cat => {
                    const lower = cat.toLowerCase();
                    return keywords.some(kw => lower.includes(kw));
                });
            }
        }

        return res.json({
            success: true,
            categories: result,
            total: result.length,
            cached: (now - lastCacheTime) < 1000 ? false : true,
        });
    } catch (err) {
        console.error('[get_categories] Error:', err);

        // Fallback to stale cache if we have ANY data
        if (cachedCategories && cachedCategories.length > 0) {
            console.log('[get_categories] Serving stale cache due to upstream error.');
            return res.json({
                success: true,
                categories: cachedCategories,
                total: cachedCategories.length,
                cached: true,
                stale: true,
            });
        }

        return res.status(500).json({ error: 'Failed to fetch categories from provider' });
    }
});

export default router;
