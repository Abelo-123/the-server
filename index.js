/**
 * Paxyo Mini App Backend — Node.js Entry Point
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import 'dotenv/config';

import pool from './config/database.js';
import depositRouter from './routes/deposit.js';
import completeDepositRouter from './routes/completeDeposit.js';
import verifyDepositRouter from './routes/verifyDeposit.js';
import chapaCallbackRouter from './routes/chapaCallback.js';
import getDepositsRouter from './routes/getDeposits.js';
import getBalanceRouter from './routes/getBalance.js';
import getServicesRouter from './routes/getServices.js';
import ordersRouter from './routes/orders.js';
import appRouter from './routes/app.js';
import chatRouter from './routes/chat.js';
import getCategoriesRouter from './routes/getCategories.js';
import adminUsersRouter from './routes/adminUsers.js';
import recommendedServicesRouter from './routes/recommendedServices.js';

const app = express();

// cPanel/Passenger priority: Always use process.env.PORT if provided.
// On cPanel, this is usually a path to a socket, not a number.
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ optionsSuccessStatus: 200 }));
app.use(compression({
    level: 6,
    threshold: 1024
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Test DB connection
app.get('/api/test-db', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM auth');
        res.json({ success: true, userCount: rows[0].cnt });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Chapa Routes
app.use('/api/deposit', depositRouter);
app.use('/api/complete-deposit', completeDepositRouter);
app.use('/api/verify-deposit', verifyDepositRouter);
app.use('/api/chapa-callback', chapaCallbackRouter);

// User Data Routes
app.use('/api/deposits', getDepositsRouter);
app.use('/api/balance', getBalanceRouter);
app.use('/api/services', getServicesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/app', appRouter);
app.use('/api/chat', chatRouter);
app.use('/api/categories', getCategoriesRouter);
app.use('/api/admin', adminUsersRouter);
app.use('/api/services', recommendedServicesRouter);

// Start server
// In cPanel/Passenger, we MUST NOT specify a port number if we want it to handle routing.
// However, the function requires one or it defaults to a random one.
// The trick is to listen on the variable provided by Passenger.
app.listen(PORT, () => {
    console.log(`🚀 Paxyo Backend running on port ${PORT}`);
});
