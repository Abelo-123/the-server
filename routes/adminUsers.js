/**
 * Get All Users with Sorting — Admin Panel
 * 
 * GET /api/admin/users
 * Query params:
 *   - sort: last_registration | last_deposit | bigger_balance | total_spent | last_order
 *   - order: asc | desc (default: desc)
 *   - limit: number (default: 50)
 *   - offset: number (default: 0)
 */
import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

router.get('/users', async (req, res) => {
    try {
        const { sort = 'last_registration', order = 'desc', limit = 50, offset = 0 } = req.query;
        
        // Validate inputs
        const validSorts = ['last_registration', 'last_deposit', 'bigger_balance', 'total_spent', 'last_order'];
        const validOrders = ['asc', 'desc'];
        
        if (!validSorts.includes(sort)) {
            return res.status(400).json({ error: 'Invalid sort parameter' });
        }
        if (!validOrders.includes(order)) {
            return res.status(400).json({ error: 'Invalid order parameter' });
        }

        // Build query based on sort type
        let orderBy;
        switch (sort) {
            case 'last_registration':
                orderBy = `ORDER BY last_login ${order.toUpperCase()}`;
                break;
            case 'last_deposit':
                orderBy = `ORDER BY last_deposit ${order.toUpperCase()}`;
                break;
            case 'bigger_balance':
                orderBy = `ORDER BY balance ${order.toUpperCase()}`;
                break;
            case 'total_spent':
                orderBy = `ORDER BY total_spent ${order.toUpperCase()}`;
                break;
            case 'last_order':
                orderBy = `ORDER BY last_order ${order.toUpperCase()}`;
                break;
            default:
                orderBy = `ORDER BY last_login DESC`;
        }

        const limitNum = Math.min(parseInt(limit) || 50, 100);
        const offsetNum = parseInt(offset) || 0;

        // Build WHERE clause for sorting
        let orderBySQL;
        switch (sort) {
            case 'last_registration':
                orderBySQL = `ORDER BY last_login ${order.toUpperCase()}`;
                break;
            case 'last_deposit':
                orderBySQL = `ORDER BY last_deposit ${order.toUpperCase()}`;
                break;
            case 'bigger_balance':
                orderBySQL = `ORDER BY balance ${order.toUpperCase()}`;
                break;
            case 'last_order':
                orderBySQL = `ORDER BY last_order ${order.toUpperCase()}`;
                break;
            default:
                orderBySQL = `ORDER BY id ${order.toUpperCase()}`;
        }

        const [users] = await pool.execute(
            `SELECT * FROM auth ${orderBySQL} LIMIT ? OFFSET ?`,
            [limitNum, offsetNum]
        );

        const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM auth');
        const total = countResult[0].total;

        res.json({
            success: true,
            users: users.map(u => ({
                ...u,
                balance: parseFloat(u.balance) || 0
            })),
            pagination: { total, limit: limitNum, offset: offsetNum, hasMore: offsetNum + limitNum < total }
        });

    } catch (err) {
        console.error('[admin_users] Error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/admin/alerts
router.post('/alerts', async (req, res) => {
    try {
        const { target, title, message, type = 'info' } = req.body;
        
        if (!title || !message || !target) {
            return res.status(400).json({ error: 'target, title, and message are required' });
        }

        if (target === 'all') {
            await pool.execute(
                `INSERT INTO alerts (user_id, title, message, type)
                 SELECT tg_id, ?, ?, ? FROM auth`,
                [title, message, type]
            );
        } else {
            await pool.execute(
                'INSERT INTO alerts (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [target, title, message, type]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[admin_alerts] Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Support Chat ────────────────────────────────────────────────
router.get('/chat/sessions', async (req, res) => {
    try {
        // Get all unique users who have a chat message, sorted by last message created_at
        const [sessions] = await pool.execute(`
            SELECT c.user_id, a.username, a.first_name, MAX(c.created_at) as last_message_at
            FROM chat_messages c
            LEFT JOIN auth a ON c.user_id = a.tg_id
            GROUP BY c.user_id, a.username, a.first_name
            ORDER BY last_message_at DESC
        `);
        return res.json(sessions);
    } catch (err) {
        console.error('[admin/chat/sessions]', err);
        return res.status(500).json({ error: 'Failed to load chat sessions' });
    }
});

router.get('/chat/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const [messages] = await pool.execute(
            'SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC',
            [user_id]
        );
        return res.json(messages);
    } catch (err) {
        console.error('[admin/chat/messages]', err);
        return res.status(500).json({ error: 'Failed to load messages' });
    }
});

router.post('/chat/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });

        await pool.execute(
            'INSERT INTO chat_messages (user_id, message, is_admin, created_at) VALUES (?, ?, 1, NOW())',
            [user_id, message]
        );
        return res.json({ success: true });
    } catch (err) {
        console.error('[admin/chat/send]', err);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;
