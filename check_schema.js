import pool from './config/database.js';

async function check() {
  const [orders] = await pool.execute('SHOW COLUMNS FROM orders');
  console.log('ORDERS:', orders.map(c => c.Field));
  const [trans] = await pool.execute('SHOW COLUMNS FROM transactions');
  console.log('TRANSACTIONS:', trans.map(c => c.Field));
  process.exit();
}
check();
