import crypto from 'crypto';

/**
 * Validates Telegram initData and returns the user ID if valid.
 */
export function getTelegramUserId(initData) {
    if (!initData || typeof initData !== 'string') return null;

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        
        // If there's no hash, it's not valid Telegram data
        if (!hash) return null;
        
        params.delete('hash');
        
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Safely fallback if BOT_TOKEN is missing in local .env
        const botToken = process.env.BOT_TOKEN || 'dummy_local_token';
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

        if (hash !== calculatedHash) {
            return null;
        }
        
        const userStr = params.get('user');
        if (!userStr) return null;

        const userData = JSON.parse(userStr);
        return userData?.id ? String(userData.id) : null;
    } catch (err) {
        return null;
    }
}

/**
 * Validates Telegram initData and returns the user object if valid.
 */
export function getTelegramUser(initData) {
    if (!initData || typeof initData !== 'string') return null;

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        
        params.delete('hash');
        
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const botToken = process.env.BOT_TOKEN || 'dummy_local_token';
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

        if (hash !== calculatedHash) return null;

        const userStr = params.get('user');
        if (!userStr) return null;

        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

