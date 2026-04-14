const PAXYO_BOT_URL = 'https://paxyo-bot-ywuk.onrender.com/api/sendToJohn';

export async function sendNotification(type, params) {
    console.log(`[notify] === ${type.toUpperCase()} START ===`, JSON.stringify({ type, ...params }));
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const payload = { type, ...params };
        console.log('[notify] Sending payload:', payload);
        
        const res = await fetch(PAXYO_BOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const data = await res.json();
        console.log(`[notify] ${type} response:`, data);
        return { success: true };
    } catch (err) {
        console.log(`[notify] ${type} error (but returning success):`, err.message);
        return { success: true };
    }
}

export async function notifyNewUser({ uid, uuid }) {
    return sendNotification('newuser', { uid, uuid });
}

export async function notifyNewOrder({ uid, uuid, service, order, amount }) {
    console.log('[notify] notifyNewOrder called with:', { uid, uuid, service, order, amount });
    return sendNotification('neworder', { uid, uuid, service, order, amount });
}

export async function notifyDeposit({ uid, amount, uuid = 'Chapa' }) {
    return sendNotification('deposit', { uid, amount, uuid });
}