/**
 * Database Configuration — MySQL2 Connection Pool
 */
import mysql from 'mysql2/promise';
import 'dotenv/config';

// Debug: log env vars
console.log('[db] DB_USER:', process.env.DB_USER);
console.log('[db] DB_PASS:', process.env.DB_PASS ? '***' : '(empty)');
console.log('[db] DB_NAME:', process.env.DB_NAME);

// Read host from .env, default to localhost for cPanel
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306'),
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// TEST CONNECTION AND LOG ERRORS
pool.getConnection()
    .then(async conn => {
        console.log('✅ DB Connected');
        try {
            // Recreate chat_messages table with correct schema
            await conn.execute(`DROP TABLE IF EXISTS chat_messages`);
            await conn.execute(`
                CREATE TABLE chat_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    message TEXT NOT NULL,
                    is_admin TINYINT(1) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ chat_messages table ready');
        } catch (e) {
            console.error('❌ Failed to create chat_messages table', e);
        }
        conn.release();
    })
    .catch(err => {
        console.error('❌ DB CONNECTION ERROR:', err.message);
        console.error('   Check if user is assigned to DB in cPanel with All Privileges.');
    });

export default pool;
