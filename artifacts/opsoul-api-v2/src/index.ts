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
import googleIntegrationRouter from './routes/google-integration.js';
import filesRouter from './routes/files.js';
import tasksRouter from './routes/tasks.js';
import slotsRouter from './routes/slots.js';
import secretsRouter from './routes/secrets.js';
import platformSkillsRouter from './routes/platform-skills.js';
import capabilityRequestsRouter from './routes/capability-requests.js';
import publicChatRouter from './routes/publicChat.js';
import adminRouter from './routes/admin.js';
import uploadRouter from './routes/upload.js';
import transcribeRouter from './routes/transcribe.js';
import vaelRouter from './routes/vael.js';
import publicCrudRouter from './routes/publicCrud.js';
import adminRagRouter from './routes/adminRag.js';
import contactRouter from './routes/contact.js';

import { pool } from '@workspace/db-v2';
import { runGrowCron } from './cron/growCron.js';
import { runVaelCron } from './cron/vaelCron.js';
import { runMemoryDecayCron } from './cron/memoryCron.js';
import { startDriftCron } from './cron/driftCron.js';
import { backfillIntegrationSkills } from './utils/autoInstallIntegrationSkills.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/v3/health', (_, res) => {
  res.json({ status: 'ok', version: 'v3', schema: 'opsoul_v3', ts: new Date().toISOString() });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.use('/api/v3/auth', authRouter);

// ── Operators (root) ──────────────────────────────────────────────────────────

app.use('/api/v3/operators', operatorsRouter);

// ── Nested under /operators/:operatorId ──────────────────────────────────────

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
app.use('/api/v3/operators/:operatorId/secrets', secretsRouter);
app.use('/api/v3/operators/:operatorId/capability-requests', capabilityRequestsRouter);

// ── Platform-level ────────────────────────────────────────────────────────────

app.use('/api/v3/platform-skills', platformSkillsRouter);
app.use('/api/v3/admin/rag', adminRagRouter);
app.use('/api/v3/admin', adminRouter);
app.use('/api/v3/upload', uploadRouter);
app.use('/api/v3/transcribe', transcribeRouter);
app.use('/api/v3/vael', vaelRouter);
app.use('/api/v3/contact', contactRouter);
app.use('/api/v3/integrations/google', googleIntegrationRouter);
app.use('/v3/chat', publicChatRouter);
app.use('/v3/action', publicCrudRouter);

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

// Soul drift — every 90 days at 03:00 UTC on the 1st
startDriftCron();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[opsoul-v3] API running on port ${PORT} → opsoul_v3 schema`);
  backfillIntegrationSkills().catch((err: Error) =>
    console.warn('[startup] backfillIntegrationSkills failed:', err.message),
  );
});

export default app;
