import pool from './config/database.js';

async function testPlaceOrder() {
  const conn = await pool.getConnection();
  try {
    console.log('1. Setting up mock user with balance...');
    const tgId = '999999999';
    await conn.execute('INSERT IGNORE INTO auth (tg_id, balance, username) VALUES (?, 10000, "testuser")', [tgId]);
    await conn.execute('UPDATE auth SET balance = 10000 WHERE tg_id = ?', [tgId]);

    console.log('2. Fetching valid service from GodOfPanel to test with...');
    const apiKey = '7aed775ad8b88b50a1706db2f35c5eaf';
    const gopRes = await fetch(`https://godofpanel.com/api/v2?key=${apiKey}&action=services`);
    const allServices = await gopRes.json();
    const serviceData = allServices.find(s => parseInt(s.min) <= 1000);
    
    if (!serviceData) {
        throw new Error("Could not find a valid service to test with");
    }
    
    const service = serviceData.service;
    const link = 'https://t.me/durov';
    const quantity = 100;
    
    console.log(`Using Service ID: ${service} (${serviceData.name})`);

    console.log('3. Running local route logic...');
    await conn.beginTransaction();
            
    // 1. Get rate multiplier
    const [settingsRows] = await conn.execute('SELECT setting_value FROM settings WHERE setting_key = "rate_multiplier"');
    const rateMultiplier = settingsRows.length > 0 ? parseFloat(settingsRows[0].setting_value) : 55.0;

    // 2. Lock user row to prevent race conditions
    const [userRows] = await conn.execute('SELECT * FROM auth WHERE tg_id = ? FOR UPDATE', [tgId]);
    const user = userRows[0];
    if (!user) {
        await conn.rollback();
        throw new Error('User not found');
    }

    // Calculate cost
    const unitRateUsd = parseFloat(serviceData.rate);
    const totalCostUsd = unitRateUsd * (quantity / 1000);
    const totalCostEtb = totalCostUsd * rateMultiplier;

    if (parseFloat(user.balance) < totalCostEtb) {
        await conn.rollback();
        throw new Error('Insufficient balance');
    }

    // 4. Place order to GodOfPanel
    const orderParams = new URLSearchParams({
        key: apiKey,
        action: 'add',
        service: service.toString(),
        link: link,
        quantity: quantity.toString()
    });

    console.log('Sending to GodOfPanel...');
    const orderRes = await fetch('https://godofpanel.com/api/v2', {
        method: 'POST',
        body: orderParams
    });
    const orderData = await orderRes.json();
    console.log('GOP Response:', orderData);

    if (orderData.error) {
        await conn.rollback();
        throw new Error(orderData.error);
    }

    const providerOrderId = orderData.order;
    console.log('GOP Order ID:', providerOrderId);

    // 5. Update user balance
    await conn.execute('UPDATE auth SET balance = balance - ? WHERE tg_id = ?', [totalCostEtb, tgId]);

    // Get new balance
    const [newBalRows] = await conn.execute('SELECT balance FROM auth WHERE tg_id = ?', [tgId]);
    const newBalanceStr = newBalRows[0].balance;

    console.log('Inserting into orders...');
    // 6. Insert Order into DB
    const [insertRes] = await conn.execute(
        `INSERT INTO orders 
         (user_id, service_id, link, target_link, quantity, api_order_id, charge, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [tgId, service, link, link, quantity, providerOrderId, totalCostEtb]
    );

    console.log('Inserting into transactions...');
    // 7. Log Transaction
    await conn.execute(
        `INSERT INTO transactions 
         (user_id, type, amount, balance_after, reference_type, reference_id, description)
         VALUES (?, 'order', ?, ?, 'order', ?, 'Placed Order #${insertRes.insertId}')`,
        [tgId, -totalCostEtb, newBalanceStr, insertRes.insertId]
    );

    await conn.commit();
    console.log('Success! Order ID:', insertRes.insertId);
    
    // Cleanup fake order from DB
    await conn.execute('DELETE FROM orders WHERE id = ?', [insertRes.insertId]);
    await conn.execute('DELETE FROM transactions WHERE reference_id = ? AND reference_type = "order"', [insertRes.insertId]);
    
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('\n--- TEST SCRIPT ERROR ---');
    console.error(err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

testPlaceOrder();
