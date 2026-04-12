import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';

import authRouter from './routes/auth.js';
import operatorsRouter from './routes/operators.js';
import conversationsRouter from './routes/conversations.js';
import chatRouter from './routes/chat.js';
import kbRouter from './routes/kb.js';
import memoryRouter from './routes/memory.js';
import growRouter from './routes/grow.js';
import skillsRouter from './routes/skills.js';
import integrationsRouter from './routes/integrations.js';
import filesRouter from './routes/files.js';
import tasksRouter from './routes/tasks.js';
import slotsRouter from './routes/slots.js';
import publicChatRouter from './routes/publicChat.js';
import adminRouter from './routes/admin.js';

import { pool } from '@workspace/db-v2';
import { runGrowCron } from './cron/growCron.js';
import { runVaelCron } from './cron/vaelCron.js';
import { runMemoryDecayCron } from './cron/memoryCron.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.get('/api/v3/health', (_, res) => {
  res.json({ status: 'ok', version: 'v3', schema: 'opsoul_v3', ts: new Date().toISOString() });
});

app.use('/api/v3/auth', authRouter);
app.use('/api/v3/operators', operatorsRouter);
app.use('/api/v3/operators/:operatorId/conversations', conversationsRouter);
app.use('/api/v3/operators/:operatorId/conversations/:convId/messages', chatRouter);
app.use('/api/v3/operators/:operatorId', kbRouter);
app.use('/api/v3/operators/:operatorId/memory', memoryRouter);
app.use('/api/v3/operators/:operatorId/grow', growRouter);
app.use('/api/v3/operators/:operatorId/skills', skillsRouter);
app.use('/api/v3/operators/:operatorId/integrations', integrationsRouter);
app.use('/api/v3/operators/:operatorId/files', filesRouter);
app.use('/api/v3/operators/:operatorId/tasks', tasksRouter);
app.use('/api/v3/operators/:operatorId/slots', slotsRouter);
app.use('/api/v3/admin', adminRouter);
app.use('/v3/chat', publicChatRouter);

// ── Cron jobs ─────────────────────────────────────────────────────────────────
// GROW — daily at 02:00 UTC
cron.schedule('0 2 * * *', () => {
  console.log('[cron] GROW daily evaluation starting');
  runGrowCron().catch((err: Error) => console.error('[cron] GROW failed:', err.message));
});

// Vael — full sweep twice daily
cron.schedule('0 1,13 * * *', () => {
  console.log('[cron] Vael full sweep starting');
  runVaelCron('full_sweep').catch((err: Error) => console.error('[cron] Vael failed:', err.message));
});

// Memory decay — daily at 04:00 UTC
cron.schedule('0 4 * * *', () => {
  console.log('[cron] Memory decay starting');
  runMemoryDecayCron().catch((err: Error) => console.error('[cron] Memory decay failed:', err.message));
});

// DB keepalive — every 4 minutes
cron.schedule('*/4 * * * *', () => {
  pool.query('SELECT 1').catch(() => {});
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[opsoul-v3] API running on port ${PORT} → opsoul_v3 schema`);
});

export default app;
