/**
 * Chapa Callback — Server-to-server notification
 *
 * GET/POST /api/chapa-callback
 *
 * Fixed to prevent database deadlock by moving Chapa API call
 * OUTSIDE the database transaction.
 */

import { Router } from 'express';
import crypto from 'crypto';
import pool from '../config/database.js';
import Chapa from '../lib/chapa.js';
import { processTransaction } from '../lib/wallet.js';

const router = Router();

async function handleCallback(req, res) {
    // 1. Signature Verification (Only for POST)
    if (req.method === 'POST') {
        const signature = req.headers['chapa-signature'];
        const secret = process.env.CHAPA_SECRET_KEY;
        
        if (signature && secret) {
            const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
            if (signature !== hash) {
                console.warn('[chapa_callback] Invalid signature');
                return res.status(401).send('Forbidden');
            }
        }
    }

    // Extract tx_ref from GET or POST
    const txRef =
        req.query?.trx_ref ||
        req.query?.tx_ref ||
        req.body?.tx_ref ||
        req.body?.trx_ref ||
        '';

    if (!txRef) {
        return res.json({ success: false, message: 'Missing tx_ref' });
    }

    try {
        // 1. Check status without locking to avoid pool exhaustion
        const [initialCheck] = await pool.execute('SELECT status FROM deposits WHERE tx_ref = ?', [txRef]);
        
        if (!initialCheck[0]) {
            return res.json({ success: false, message: 'Deposit not found' });
        }
        
        if (initialCheck[0].status === 'success') {
            return res.json({ success: true, message: 'Already processed' });
        }

        // 2. Call Chapa API outside the lock
        const chapa = new Chapa();
        const result = await chapa.verify(txRef);

        const chapaStatus = (result.data?.status ?? '').toLowerCase();
        const isSuccess = result.success && (chapaStatus === 'success' || chapaStatus === 'paid');

        // 3. Start transaction only for writing
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [pendingDeposits] = await conn.execute(
                "SELECT * FROM deposits WHERE tx_ref = ? FOR UPDATE",
                [txRef]
            );
            const deposit = pendingDeposits[0];

            if (!deposit || deposit.status === 'success') {
                await conn.rollback();
                conn.release();
                return res.json({ success: true, message: 'Already processed or not found' });
            }

            if (isSuccess) {
                const verifiedAmount = parseFloat(result.data?.amount) || deposit.amount;
                const chapaRef = result.data?.reference || '';
                const responseJson = JSON.stringify(result.raw);

                await conn.execute(
                    "UPDATE deposits SET status = 'success', chapa_tx_ref = ?, chapa_response = ?, completed_at = NOW() WHERE id = ?",
                    [chapaRef, responseJson, deposit.id]
                );

                await processTransaction(
                    String(deposit.user_id),
                    'deposit',
                    verifiedAmount,
                    `Chapa deposit (callback) - ${chapaRef}`,
                    conn,
                    'deposit',
                    deposit.id
                );

                await conn.commit();
                conn.release();
                return res.json({ success: true, message: 'Deposit completed successfully' });
            } else {
                const realStatus = result.data?.status || result.raw?.status || 'pending';
                if (realStatus === 'failed') {
                    await conn.execute("UPDATE deposits SET status = 'failed' WHERE id = ?", [deposit.id]);
                }
                
                await conn.commit();
                conn.release();
                return res.json({ success: false, message: 'Payment verification failed or pending' });
            }
        } catch (err) {
            await conn.rollback();
            conn.release();
            throw err;
        }
    } catch (err) {
        console.error('[chapa_callback] Error:', err);
        return res.json({ success: false, message: 'System error' });
    }
}

router.get('/', handleCallback);
router.post('/', handleCallback);

export default router;