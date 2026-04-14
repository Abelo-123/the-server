/**
 * Get Recommended Services (Top Services) — Admin Configured
 * 
 * GET /api/services/top
 * Returns services configured as "recommended" by admin
 */
import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

router.get('/top', async (req, res) => {
    try {
        // Get recommended service IDs from DB
        const [recRows] = await pool.execute('SELECT service_id FROM recommended_services');
        const recommendedIds = recRows.map(r => r.service_id);

        if (recommendedIds.length === 0) {
            return res.json({
                success: true,
                services: [],
                message: 'No recommended services configured'
            });
        }

        // Get all services and filter by recommended IDs
        const [allRows] = await pool.execute('SELECT * FROM service_custom WHERE is_enabled = 1');
        
        // Fetch from GodOfPanel for full service details
        const apiKey = process.env.GODOFPANEL_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const response = await fetch(`https://godofpanel.com/api/v2?key=${apiKey}&action=services`);
        const allServices = await response.json();

        if (!Array.isArray(allServices)) {
            return res.status(502).json({ error: 'Failed to fetch services' });
        }

        // Filter to only recommended services
        const topServices = allServices.filter(s => recommendedIds.includes(parseInt(s.service)));

        // Get rate multiplier
        const [settingsRows] = await pool.execute(
            'SELECT setting_value FROM settings WHERE setting_key = "rate_multiplier"'
        );
        const rateMultiplier = settingsRows.length > 0 
            ? parseFloat(settingsRows[0].setting_value) || 55.0 
            : 55.0;

        // Transform
        const transformed = topServices.map(svc => ({
            service: parseInt(svc.service),
            name: svc.name,
            type: svc.type,
            category: svc.category,
            rate: (parseFloat(svc.rate) * rateMultiplier).toFixed(2),
            min: parseInt(svc.min),
            max: parseInt(svc.max),
            refill: svc.refill === true || svc.refill === 1,
            cancel: svc.cancel === true || svc.cancel === 1,
        }));

        res.json({
            success: true,
            services: transformed,
            count: transformed.length
        });

    } catch (err) {
        console.error('[get_top_services] Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin: Add recommended service
router.post('/recommended', async (req, res) => {
    try {
        const { service_id, action } = req.body; // action: 'add' or 'remove'
        
        if (!service_id) {
            return res.status(400).json({ error: 'service_id required' });
        }

        if (action === 'remove') {
            await pool.execute('DELETE FROM recommended_services WHERE service_id = ?', [service_id]);
            return res.json({ success: true, message: `Service ${service_id} removed from recommended` });
        }

        // Add (check if already exists)
        await pool.execute(
            'INSERT IGNORE INTO recommended_services (service_id) VALUES (?)',
            [service_id]
        );
        
        res.json({ success: true, message: `Service ${service_id} added to recommended` });

    } catch (err) {
        console.error('[add_recommended] Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin: List all recommended service IDs
router.get('/recommended', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM recommended_services ORDER BY id DESC');
        res.json({ success: true, recommended: rows });
    } catch (err) {
        console.error('[list_recommended] Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
