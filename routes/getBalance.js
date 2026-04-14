/**
 * Get Balance — Fetch user's current wallet balance
 *
 * POST /api/balance
 *
 * Request body (JSON):
 *   { initData: string }
 *
 * Response:
 *   { success: true, balance: number }
 *
 * Replaces: get_balance.php
 */
import { Router } from 'express';
import pool from '../config/database.js';
import { getTelegramUserId } from '../lib/auth.js';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const initData = req.body?.initData || '';
        const user_id = req.body?.user_id || '';

        // Authenticate user (with local fallback)
        let tgId = getTelegramUserId(initData);
        if (!tgId) {
            tgId = user_id || 'unauth_local_user';
        }

        const [rows] = await pool.execute('SELECT balance FROM auth WHERE tg_id = ?', [tgId]);

        const balance = rows.length > 0 ? parseFloat(rows[0].balance) : 0;

        return res.json({
            success: true,
            balance,
        });
    } catch (err) {
        console.error('[get_balance] Error:', err);
        return res.json({ 
            success: false, 
            error: 'Database error',
            debug: err.message,
            code: err.code
        });
    }
});

export default router;
