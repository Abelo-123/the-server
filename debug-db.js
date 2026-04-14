/**
 * Database Connection Debug Tool
 */
import express from 'express';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const app = express();
app.use(express.json());

// Root route to test if server is running
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Debug server is running' });
});

app.get('/debug/db', async (req, res) => {
    const results = {
        timestamp: new Date().toISOString(),
        config: {
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            database: DB_CONFIG.database,
            port: DB_CONFIG.port,
        },
        steps: [],
    };

    try {
        // Step 1: Try to connect
        results.steps.push({ step: 'connect', status: 'pending' });
        const conn = await mysql.createConnection(DB_CONFIG).connect();
        results.steps[0].status = 'success';
        results.steps.push({ step: 'connection', status: 'success', message: 'Connected to MySQL' });

        // Step 2: Check database exists
        results.steps.push({ step: 'check_database', status: 'pending' });
        const [dbs] = await conn.query('SHOW DATABASES');
        const dbExists = dbs.some((d: any) => d.Database === DB_CONFIG.database);
        results.steps[1].status = 'success';
        results.steps.push({ step: 'database_exists', status: dbExists ? 'success' : 'fail', database: DB_CONFIG.database });

        if (dbExists) {
            // Step 3: Check tables
            results.steps.push({ step: 'check_tables', status: 'pending' });
            const [tables] = await conn.query('SHOW TABLES');
            results.steps[2].status = 'success';
            results.tables = tables.map((t: any) => Object.values(t)[0]);

            // Step 4: Check specific tables
            const requiredTables = ['auth', 'deposits', 'orders', 'settings'];
            results.tableCheck = {};
            for (const table of requiredTables) {
                const [check] = await conn.query(`SHOW TABLES LIKE '${table}'`);
                results.tableCheck[table] = check.length > 0 ? 'exists' : 'missing';
            }
        }

        // Step 5: Check user permissions
        results.steps.push({ step: 'check_permissions', status: 'pending' });
        const [grants] = await conn.query('SHOW GRANTS FOR CURRENT_USER()');
        results.steps[4].status = 'success';
        results.grants = grants;

        await conn.end();
        results.status = 'success';
        results.message = 'Database connection successful!';

    } catch (err: any) {
        results.status = 'error';
        results.message = err.message;
        results.error_code = err.code;
        results.error_errno = err.errno;
        results.error_stack = err.stack;
    }

    res.json(results);
});

// Health check
app.get('/debug/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🔍 DB Debug server running on port ${PORT}`);
    console.log(`📊 Check: http://localhost:${PORT}/debug/db`);
    console.log(`📊 Root: http://localhost:${PORT}/`);
});

// Catch-all for unmatched routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

export default app;