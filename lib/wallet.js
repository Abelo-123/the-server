import pool from '../config/database.js';

/**
 * Process a balance transaction atomically.
 * Updates the user's balance and logs the transaction to the ledger.
 * 
 * @param {string} tgId - Telegram User ID
 * @param {string} type - Transaction type (deposit, order, refund, etc.)
 * @param {number} amount - Amount to add (positive) or subtract (negative)
 * @param {string} description - Human-readable description
 * @param {Object} conn - MySQL connection (must be within a transaction)
 * @param {string|null} refType - Optional reference type (e.g., 'order', 'deposit')
 * @param {number|null} refId - Optional reference ID from the related table
 * @returns {Promise<number>} The new balance
 */
export async function processTransaction(tgId, type, amount, description, conn, refType = null, refId = null) {
    // 1. Update Balance
    await conn.execute('UPDATE auth SET balance = balance + ? WHERE tg_id = ?', [amount, tgId]);
    
    // 2. Get New Balance
    const [rows] = await conn.execute('SELECT balance FROM auth WHERE tg_id = ?', [tgId]);
    if (rows.length === 0) throw new Error('User not found');
    const newBalance = parseFloat(rows[0].balance);
    
    // 3. Log to Ledger
    await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_after, reference_type, reference_id, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tgId, type, amount, newBalance, refType, refId, description]
    );
    
    return newBalance;
}
