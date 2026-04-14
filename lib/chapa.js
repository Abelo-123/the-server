/**
 * Chapa API Wrapper — Node.js
 *
 * Wraps Chapa's REST API into simple async methods for:
 *   - Initializing a payment (redirect mode)
 *   - Verifying a transaction (server-side verification)
 *
 * Replaces the PHP Chapa.php class.
 */
import 'dotenv/config';

const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;
const CHAPA_BASE_URL = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3001';

class Chapa {
    /**
     * Initialize a payment transaction on Chapa.
     *
     * @param {Object} data - { amount, email, first_name, last_name, tx_ref, return_url? }
     * @returns {Promise<Object>} Normalized result: { success, httpCode, data, message, raw }
     */
    async initialize(data) {
        const email =
            data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
                ? data.email
                : 'customer@paxyo.com';

        const payload = {
            amount: data.amount,
            currency: 'ETB',
            email,
            first_name: data.first_name || 'User',
            last_name: data.last_name || '',
            tx_ref: data.tx_ref,
            callback_url: `${SITE_URL}/api/chapa-callback`,
            return_url: data.return_url || `${SITE_URL}/api/chapa-callback`,
            customization: {
                title: 'Paxyo Deposit',
                description: 'Wallet deposit',
            },
        };

        return this._request('POST', '/transaction/initialize', payload);
    }

    /**
     * Verify a transaction's payment status with Chapa.
     *
     * @param {string} txRef - The transaction reference to verify
     * @returns {Promise<Object>} Normalized result
     */
    async verify(txRef) {
        return this._request('GET', `/transaction/verify/${txRef}`);
    }

    /**
     * Low-level HTTP request to Chapa API.
     */
    async _request(method, endpoint, body = null) {
        // Add cache busting timestamp for GET requests to prevent stale "pending" loops
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${CHAPA_BASE_URL}${endpoint}${method === 'GET' ? `${separator}_t=${Date.now()}` : ''}`;
        
        const headers = {
            Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        const options = { method, headers };
        if (method === 'POST' && body) {
            options.body = JSON.stringify(body);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            options.signal = controller.signal;

            const res = await fetch(url, options);
            clearTimeout(timeoutId);

            const httpCode = res.status;
            const decoded = await res.json().catch(() => null);

            return {
                success: httpCode === 200 && (decoded?.status ?? '') === 'success',
                httpCode,
                data: decoded?.data ?? {},
                message: decoded?.message ?? 'Unknown error',
                raw: decoded,
            };
        } catch (err) {
            return {
                success: false,
                httpCode: 0,
                data: {},
                message: `Request error: ${err.message}`,
                raw: null,
            };
        }
    }
}

export default Chapa;
