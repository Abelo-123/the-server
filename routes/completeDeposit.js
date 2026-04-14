/**
 * Complete Deposit — Verify & Credit Balance
 *
 * POST /api/complete-deposit
 *
 * Fixed to prevent database deadlock by moving Chapa API call
 * OUTSIDE the database transaction.
 */

import { Router } from 'express';
import pool from '../config/database.js';
import Chapa from '../lib/chapa.js';
import { getTelegramUserId } from '../lib/auth.js';
import { processTransaction } from '../lib/wallet.js';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const { tx_ref: txRef, amount: rawAmount, chapa_ref: chapaRef, initData, user_id } = req.body;
        const amount = parseFloat(rawAmount) || 0;

        // Authenticate user (with local fallback)
        let tgId = getTelegramUserId(initData);
        if (!tgId) {
            tgId = user_id || 'unauth_local_user';
        }

        if (!txRef) {
            return res.json({ success: false, error: 'Missing transaction reference' });
        }

        // 1. Check if already processed
        let [deposits] = await pool.execute('SELECT * FROM deposits WHERE tx_ref = ?', [txRef]);
        let deposit = deposits[0];

        if (deposit && deposit.status === 'success') {
            const [balRows] = await pool.execute('SELECT balance FROM auth WHERE tg_id = ?', [deposit.user_id]);
            return res.json({
                success: true,
                new_balance: parseFloat(balRows[0]?.balance) || 0,
                already_completed: true,
            });
        }

        // 2. Verify with Chapa API OUTSIDE the lock
        const chapa = new Chapa();
        const verifyResult = await chapa.verify(txRef);

        const chapaStatus = (verifyResult.data?.status ?? '').toLowerCase();
        const isSuccess = verifyResult.success && (chapaStatus === 'success' || chapaStatus === 'paid');

        // 3. Start transaction
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [lockedDeposits] = await conn.execute(
                'SELECT * FROM deposits WHERE tx_ref = ? FOR UPDATE',
                [txRef]
            );
            deposit = lockedDeposits[0];

            if (!deposit) {
                if (amount > 0) {
                    await conn.execute(
                        "INSERT INTO deposits (user_id, amount, tx_ref, status) VALUES (?, ?, ?, 'pending')",
                        [tgId, amount, txRef]
                    );
                    const [newDeposits] = await conn.execute('SELECT * FROM deposits WHERE tx_ref = ? FOR UPDATE', [txRef]);
                    deposit = newDeposits[0];
                } else {
                    await conn.rollback();
                    conn.release();
                    return res.json({ success: false, error: 'Deposit not found' });
                }
            }

            if (deposit.status === 'success') {
                await conn.rollback();
                const [balRows] = await conn.execute('SELECT balance FROM auth WHERE tg_id = ?', [deposit.user_id]);
                conn.release();
                return res.json({
                    success: true,
                    new_balance: parseFloat(balRows[0]?.balance) || 0,
                    already_completed: true,
                });
            }

            if (isSuccess) {
                const verifiedAmount = parseFloat(verifyResult.data?.amount) || deposit.amount;
                const verifiedChapaRef = verifyResult.data?.reference || chapaRef || '';
                const responseJson = JSON.stringify(verifyResult.raw);

                await conn.execute(
                    "UPDATE deposits SET status = 'success', chapa_tx_ref = ?, chapa_response = ?, completed_at = NOW() WHERE id = ?",
                    [verifiedChapaRef, responseJson, deposit.id]
                );

                const newBalance = await processTransaction(
                    String(deposit.user_id),
                    'deposit',
                    verifiedAmount,
                    `Chapa deposit (verified) - ${verifiedChapaRef}`,
                    conn,
                    'deposit',
                    deposit.id
                );

                await conn.commit();
                conn.release();

                return res.json({
                    success: true,
                    new_balance: newBalance,
                    verified: true,
                });
            } else {
                await conn.commit();
                conn.release();
                return res.json({
                    success: true,
                    pending: true,
                    message: 'Payment is being processed. Your balance will update shortly.',
                });
            }
        } catch (err) {
            await conn.rollback();
            conn.release();
            throw err;
        }
    } catch (err) {
        console.error('[complete_deposit] Error:', err);
        return res.json({ success: false, error: 'System error: ' + err.message });
    }
});

export default router;