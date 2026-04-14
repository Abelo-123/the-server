/**
 * Get Deposits — Fetch user's deposit history
 *
 * GET/POST /api/deposits
 *
 * Request body/query:
 *   { initData: string, limit?: number }
 *
 * Response:
 *   [ { id, amount, reference_id, status, method, created_at, completed_at }, ... ]
 *
 * Replaces: get_deposits.php
 */
import { Router } from 'express';
import pool from '../config/database.js';
import { getTelegramUserId } from '../lib/auth.js';

const router = Router();

async function handleGetDeposits(req, res) {
    try {
        const initData = req.body?.initData || req.query?.initData || '';
        const limitStr = req.body?.limit || req.query?.limit || '20';
        let limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit <= 0) limit = 20;
        if (limit > 50) limit = 50; // Cap at 50

        // Authenticate user (with local fallback)
        let tgId = getTelegramUserId(initData);
        if (!tgId) {
            tgId = req.body?.user_id || req.query?.user_id || 'unauth_local_user';
        }

        const [deposits] = await pool.execute(
            `SELECT id, amount, tx_ref as reference_id, status, 'Chapa' as method, created_at, completed_at
             FROM deposits
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [tgId, limit]
        );

        return res.json(deposits);
    } catch (err) {
        console.error('[get_deposits] Error:', err);
        return res.status(500).json({ 
            success: false, 
            error: 'Database error',
            debug: err.message,
            code: err.code
        });
    }
}

router.get('/', handleGetDeposits);
router.post('/', handleGetDeposits);

export default router;
