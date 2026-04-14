import { Router } from 'express';
import pool from '../config/database.js';
import { getTelegramUserId, getTelegramUser } from '../lib/auth.js';

const router = Router();

// get_settings
router.get('/settings', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT setting_key, setting_value FROM settings');
        const settings = {
            rateMultiplier: 55,
            discountPercent: 0,
            holidayName: '',
            maintenanceMode: false,
            userCanOrder: true,
            marqueeText: 'Welcome to Paxyo SMM!',
            topServicesIds: ''
        };
        
        rows.forEach(row => {
            if (row.setting_key === 'rate_multiplier') settings.rateMultiplier = parseFloat(row.setting_value) || 55;
            if (row.setting_key === 'discount_percent') settings.discountPercent = parseFloat(row.setting_value) || 0;
            if (row.setting_key === 'holiday_name') settings.holidayName = row.setting_value;
            if (row.setting_key === 'maintenance_mode') settings.maintenanceMode = (row.setting_value === '1' || row.setting_value === 'true');
            if (row.setting_key === 'user_can_order') settings.userCanOrder = (row.setting_value === '1' || row.setting_value === 'true');
            if (row.setting_key === 'marquee_text') settings.marqueeText = row.setting_value;
            if (row.setting_key === 'top_services_ids') settings.topServicesIds = row.setting_value || '';
        });

        return res.json(settings);
    } catch (err) {
        console.error(err);
        return res.json({ rateMultiplier: 55, discountPercent: 0, holidayName: '', maintenanceMode: false, userCanOrder: true, marqueeText: '', topServicesIds: '' });
    }
});

// get_recommended
router.get('/recommended', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT service_id FROM recommended_services');
        const ids = rows.map(r => r.service_id);
        return res.json(ids);
    } catch (err) {
        console.error(err);
        return res.json([]);
    }
});

// get alerts
router.post('/alerts', async (req, res) => {
    const { initData } = req.body;
    const tgId = getTelegramUserId(initData);
    if (!tgId) return res.json({ success: false, unreadCount: 0, alerts: [] });

    try {
        const [alerts] = await pool.execute('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [tgId]);
        const unreadCount = alerts.filter(a => a.is_read === 0 || a.is_read === false).length;
        return res.json({ success: true, unreadCount, alerts });
    } catch (err) {
        console.error(err);
        return res.json({ success: false, unreadCount: 0, alerts: [] });
    }
});

// mark alerts read
router.post('/alerts/mark-read', async (req, res) => {
    const { initData } = req.body;
    const tgId = getTelegramUserId(initData);
    if (!tgId) return res.json({ success: false });

    try {
        await pool.execute('UPDATE alerts SET is_read = 1 WHERE user_id = ?', [tgId]);
        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.json({ success: false });
    }
});

// auth (for telegram_auth.php)
router.post('/auth', async (req, res) => {
    const { initData, user_id } = req.body;
    const tgUser = getTelegramUser(initData);
    
    let tgId = tgUser?.id ? String(tgUser.id) : null;
    if (!tgId) {
        tgId = user_id || 'unauth_local_user';
    }

    const firstName = tgUser?.first_name || 'Local';
    const lastName = tgUser?.last_name || 'User';
    const username = tgUser?.username || 'local_user';
    const photoUrl = tgUser?.photo_url || '';

    try {
        let [users] = await pool.execute('SELECT * FROM auth WHERE tg_id = ?', [tgId]);
        if (users.length === 0) {
            await pool.execute(
                "INSERT INTO auth (tg_id, username, first_name, last_name, photo_url, balance, auth_provider, last_login) VALUES (?, ?, ?, ?, ?, 0.00, 'telegram', NOW())", 
                [tgId, username, firstName, lastName, photoUrl]
            );
            [users] = await pool.execute('SELECT * FROM auth WHERE tg_id = ?', [tgId]);
        } else {
            await pool.execute(
                'UPDATE auth SET username = ?, first_name = ?, last_name = ?, photo_url = ?, last_login = NOW() WHERE tg_id = ?', 
                [username, firstName, lastName, photoUrl, tgId]
            );
        }
        const user = users[0];
        
        return res.json({ 
            success: true, 
            user: {
                id: user.tg_id,
                tg_id: user.tg_id,
                username: user.username || username,
                first_name: user.first_name || firstName,
                last_name: user.last_name || lastName,
                photo_url: user.photo_url || photoUrl,
                balance: parseFloat(user.balance),
                role: user.role || 'user'
            }
        });
    } catch (err) {
        console.error(err);
        return res.json({ success: false, error: err.message });
    }
});

// log-init-data
router.post('/log-init-data', async (req, res) => {
    // This endpoint can be phased out as /auth handles all user info now,
    // but returning success to ensure backward compatibility.
    return res.json({ success: true });
});

// heartbeat
router.get('/heartbeat', async (req, res) => {
    return res.json({ ok: 1 });
});

export default router;
