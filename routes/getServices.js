/**
 * Get Services — Direct Fetch from GodOfPanel
 *
 * GET /api/services
 *
 * Refreshes data directly from godofpanel.com using GODOFPANEL_API_KEY
 * Applies 'rate_multiplier' from settings to convert USD -> ETB.
 */
import { Router } from 'express';
import pool from '../config/database.js';
import { getServicesCached } from '../lib/gop.js';

const router = Router();

const PLATFORM_KEYWORDS = {
    instagram: ['instagram', 'ig '],
    tiktok: ['tiktok', 'tik tok'],
    youtube: ['youtube', 'yt '],
    facebook: ['facebook', 'fb '],
    twitter: ['twitter', 'x.com', 'tweet'],
    telegram: ['telegram', 'tg '],
};

function determinePlatform(category) {
    if (!category) return 'other';
    const lower = category.toLowerCase();
    for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return platform;
        }
    }
    return 'other';
}

// In-memory cache - preloaded at startup
let cachedServices = [];
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Preload services on server start
async function preloadServices() {
    const apiKey = process.env.GODOFPANEL_API_KEY;
    if (!apiKey) {
        console.log('[get_services] No API key, skipping preload');
        return;
    }
    
    try {
        console.log('[get_services] Preloading services...');
        
        // Fetch disabled services first
        let disabledServiceIds = new Set();
        try {
            const [disabledRows] = await pool.execute('SELECT service_id FROM service_custom WHERE is_enabled = 0');
            disabledRows.forEach(row => disabledServiceIds.add(row.service_id));
            if (disabledServiceIds.size > 0) {
                console.log(`[get_services] Will exclude ${disabledServiceIds.size} disabled services`);
            }
        } catch (e) {
            // Table might not exist yet
        }
        
        const rawServices = await getServicesCached();

        if (Array.isArray(rawServices)) {
            // Filter disabled services
            cachedServices = rawServices.filter(s => !disabledServiceIds.has(parseInt(s.service)));
            lastCacheTime = Date.now();
            console.log(`[get_services] Preloaded ${cachedServices.length} services from GOP wrapper`);
        }
    } catch(e) {
        console.error('[get_services] Preload failed:', e.message);
    }
}

preloadServices();

router.get('/', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const reqCategory = req.query.category || null;
    const reqIds = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id, 10)) : null;
    const apiKey = process.env.GODOFPANEL_API_KEY;

    try {
        if (!apiKey) {
            return res.status(500).json({ error: 'GODOFPANEL_API_KEY not configured in backend .env' });
        }

        // If "top" category requested, get services from top_services_ids setting
        if (reqCategory === 'Top Services') {
            // Fetch top_services_ids from settings
            let topServicesIds = '';
            try {
                const [settingRows] = await pool.execute('SELECT setting_value FROM settings WHERE setting_key = "top_services_ids"');
                if (settingRows.length > 0) {
                    topServicesIds = settingRows[0].setting_value || '';
                }
            } catch (e) { /* ignore */ }

            if (!topServicesIds) {
                return res.json([]);
            }

            // Parse comma-separated IDs
            const recommendedIds = topServicesIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            
            if (recommendedIds.length === 0) {
                return res.json([]);
            }
            
            // Use cached services filtered to recommended IDs (maintain exact order)
            if (cachedServices && cachedServices.length > 0) {
                const [settingsRows] = await pool.execute(
                    'SELECT setting_value FROM settings WHERE setting_key = "rate_multiplier"'
                );
                const rateMultiplier = settingsRows.length > 0 
                    ? parseFloat(settingsRows[0].setting_value) || 55.0 
                    : 55.0;
                
                // Filter and maintain exact order from top_services_ids
                const filtered = recommendedIds
                    .map(id => cachedServices.find(s => parseInt(s.service) === id))
                    .filter(Boolean);

                const transformed = filtered.map(svc => ({
                    service: svc.service,
                    category: svc.category,
                    name: svc.name,
                    type: svc.type,
                    rate: (parseFloat(svc.rate) * rateMultiplier).toFixed(2),
                    min: svc.min,
                    max: svc.max,
                    average_time: svc.average_time || '',
                    refill: svc.refill,
                    cancel: svc.cancel,
                    platform_id: determinePlatform(svc.category)
                }));
                return res.json(transformed);
            }
        }

        const now = Date.now();
        
        // Always fetch latest disabled services from DB for instant filtering
        let disabledServiceIds = new Set();
        try {
            const [disabledRows] = await pool.execute('SELECT service_id FROM service_custom WHERE is_enabled = 0');
            disabledRows.forEach(row => disabledServiceIds.add(row.service_id));
        } catch (e) { /* table may not exist */ }

        // If we have preloaded cache, use it instantly
        if (!forceRefresh && cachedServices && cachedServices.length > 0) {
            let result = cachedServices;
            if (reqCategory) result = result.filter(s => s.category === reqCategory);
            if (reqIds) result = result.filter(s => reqIds.includes(s.service));
            
            // Transform with rate multiplier (cached, fast)
            const [settingsRows] = await pool.execute(
                'SELECT setting_value FROM settings WHERE setting_key = "rate_multiplier"'
            );
            let rateMultiplier = 55.0;
            if (settingsRows.length > 0) {
                rateMultiplier = parseFloat(settingsRows[0].setting_value) || 55.0;
            }

            const transformed = cachedServices
                .filter(svc => !disabledServiceIds.has(parseInt(svc.service))) // Filter disabled
                .map(svc => ({
                    service: svc.service,
                    category: svc.category,
                    name: svc.name,
                    type: svc.type,
                    rate: (parseFloat(svc.rate) * rateMultiplier).toFixed(2),
                    min: svc.min,
                    max: svc.max,
                    average_time: svc.average_time || '',
                    drip: svc.drip,
                    refill: svc.refill,
                    cancel: svc.cancel,
                    platform_id: determinePlatform(svc.category)
                }));

            // Filter by category/ids
            let finalResult = transformed;
            if (reqCategory) finalResult = finalResult.filter(s => s.category === reqCategory);
            if (reqIds) finalResult = finalResult.filter(s => reqIds.includes(s.service));

            return res.json(finalResult);
        }

        // 1. Fetch fresh or cached services from GOP (Snappy Wrapper)
        const rawServices = await getServicesCached();

        if (!rawServices || rawServices.length === 0) {
            throw new Error('GodOfPanel API is currently unavailable and no cache is present');
        }

        // 2. Fetch rate multiplier from DB
        const [settingsRows] = await pool.execute(
            'SELECT setting_value FROM settings WHERE setting_key = "rate_multiplier"'
        );
        let rateMultiplier = 55.0; // Fallback default
        if (settingsRows.length > 0) {
            rateMultiplier = parseFloat(settingsRows[0].setting_value) || 55.0;
        }

        // Fetch manual service adjustments from DB (average times, etc)
        // Table might not exist yet, we wrap in try-catch to not break completely if missing
        let adjustmentsMap = {};
        try {
            const [adjRows] = await pool.execute('SELECT service_id, average_time FROM service_adjustments');
            adjRows.forEach(row => {
                adjustmentsMap[row.service_id] = row.average_time;
            });
        } catch (dbErr) {
            console.log('[get_services] Note: service_adjustments table might be missing or empty. Skipping adjustments.');
        }

const finalServices = rawServices
    .filter(svc => !disabledServiceIds.has(parseInt(svc.service))) // Filter disabled
    .map(svc => {
    const numericRate = parseFloat(svc.rate) || 0;
    const finalRate = (numericRate * rateMultiplier).toFixed(2);
    
    return {
        service: parseInt(svc.service),
        name: svc.name,
        type: svc.type,
        category: svc.category,
        rate: finalRate,
        min: parseInt(svc.min),
        max: parseInt(svc.max),
        refill: svc.refill === true || svc.refill === 1 || svc.refill === '1',
        cancel: svc.cancel === true || svc.cancel === 1 || svc.cancel === '1',
        average_time: adjustmentsMap[svc.service] || 'Not specified',
        platform_id: determinePlatform(svc.category)
    };
});

        // Update Cache
        cachedServices = finalServices;
        lastCacheTime = now;
        
        // Filter result before sending
        let result = finalServices;
        if (reqCategory) result = result.filter(s => s.category === reqCategory);
        if (reqIds) result = result.filter(s => reqIds.includes(s.service));

        return res.json(result);
    } catch (err) {
        console.error('[get_services] Error:', err);
        
        // Fallback to cache if request fails but we have stale data
        if (cachedServices && cachedServices.length > 0) {
            console.log('[get_services] Serving stale cache due to upstream error.');
            let result = cachedServices;
            if (reqCategory) result = result.filter(s => s.category === reqCategory);
            if (reqIds) result = result.filter(s => reqIds.includes(s.service));
            return res.json(result);
        }

        return res.status(500).json({ error: 'Failed to fetch services from provider' });
    }
});

export default router;
