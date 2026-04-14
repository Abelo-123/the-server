/**
 * Database Configuration — MySQL2 Connection Pool
 */
import mysql from 'mysql2/promise';

// Hardcoded cPanel database credentials
const pool = mysql.createPool({
    host: 'localhost',
    user: 'paxyocom_newRender',
    password: '_[xgm!h,PT0MUx,y',
    database: 'paxyocom_paxyov3',
    port: 3306,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
});

// TEST CONNECTION AND LOG ERRORS
pool.getConnection()
    .then(async conn => {
        console.log('✅ DB Connected to localhost');
        try {
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
            console.error('❌ Failed to create chat_messages table', e.message);
        }
        conn.release();
    })
    .catch(err => {
        console.error('❌ DB CONNECTION ERROR:', err.message);
        console.error('   Code:', err.code);
        console.error('   errno:', err.errno);
        console.error('   syscall:', err.syscall);
    });

export default pool;