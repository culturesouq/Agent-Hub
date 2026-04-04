import { validateEnv } from '@workspace/opsoul-utils/env';

validateEnv();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pool } from '@workspace/db';
import { ADMIN_AUDIT_LOG_TRIGGER_SQL } from '@workspace/db';
import authRouter from './routes/auth.js';
import operatorsRouter from './routes/operators.js';
import ownerKbRouter from './routes/owner-kb.js';
import operatorKbRouter from './routes/operator-kb.js';
import kbRouter from './routes/kb-search.js';
import conversationsRouter from './routes/conversations.js';
import chatRouter from './routes/chat.js';
import growRouter from './routes/grow.js';
import platformSkillsRouter from './routes/platform-skills.js';
import operatorSkillsRouter from './routes/operator-skills.js';
import integrationsRouter from './routes/integrations.js';
import missionContextsRouter from './routes/mission-contexts.js';
import memoryRouter from './routes/memory.js';
import capabilityRequestsRouter from './routes/capability-requests.js';
import tasksRouter from './routes/tasks.js';
import uploadRouter from './routes/upload.js';
import transcribeRouter from './routes/transcribe.js';
import operatorFilesRouter from './routes/operatorFiles.js';
import adminRouter from './routes/admin.js';
import contactRouter from './routes/contact.js';
import { startGrowCron } from './cron/growCron.js';
import { startMemoryCron } from './cron/memoryCron.js';
import { startDriftCron } from './cron/driftCron.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? true,
  credentials: true,
}));

app.use('/api/auth', authRouter);
app.use('/api/operators', operatorsRouter);
app.use('/api/operators/:operatorId/owner-kb', ownerKbRouter);
app.use('/api/operators/:operatorId/operator-kb', operatorKbRouter);
app.use('/api/operators/:operatorId/kb', kbRouter);
app.use('/api/operators/:operatorId/conversations', conversationsRouter);
app.use('/api/operators/:operatorId/conversations/:convId/messages', chatRouter);
app.use('/api/operators/:operatorId/grow', growRouter);
app.use('/api/operators/:operatorId/skills', operatorSkillsRouter);
app.use('/api/operators/:operatorId/integrations', integrationsRouter);
app.use('/api/operators/:operatorId/mission-contexts', missionContextsRouter);
app.use('/api/operators/:operatorId/memory', memoryRouter);
app.use('/api/operators/:operatorId/capability-requests', capabilityRequestsRouter);
app.use('/api/operators/:operatorId/tasks', tasksRouter);
app.use('/api/operators/:operatorId/files', operatorFilesRouter);
app.use('/api/platform-skills', platformSkillsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/contact', contactRouter);

app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'opsoul-api', phase: 8 });
});

async function setupDatabase(): Promise<void> {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (err) {
    console.warn('[db] pgvector extension not available (non-fatal):', (err as Error).message);
  }

  try {
    await pool.query(ADMIN_AUDIT_LOG_TRIGGER_SQL);
    console.log('[db] admin_audit_log immutability trigger ensured');
  } catch (err) {
    console.error('[db] Failed to create audit log trigger:', (err as Error).message);
  }
}

async function start(): Promise<void> {
  await setupDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[opsoul-api] Phase 8 running on port ${PORT}`);
    console.log(`[opsoul-api] Auth: /api/auth/{register,login,refresh,logout,change-password,me}`);
    console.log(`[opsoul-api] Operators: /api/operators — CRUD, lock-layer1, soul, soul/reset, grow-lock`);
    console.log(`[opsoul-api] Owner KB: /api/operators/:id/owner-kb — ingest, list, get, delete`);
    console.log(`[opsoul-api] Operator KB: /api/operators/:id/operator-kb — ingest, list, get, patch, delete`);
    console.log(`[opsoul-api] KB Search: POST /api/operators/:id/kb/search — pgvector semantic search + RAG`);
    console.log(`[opsoul-api] Conversations: /api/operators/:id/conversations — CRUD + message history`);
    console.log(`[opsoul-api] Chat: POST /api/operators/:id/conversations/:convId/messages — OpenRouter stream/sync`);
    console.log(`[opsoul-api] GROW: /api/operators/:id/grow — trigger, proposals, decide`);
    console.log(`[opsoul-api] Self-Awareness: GET /grow/self-awareness, POST /grow/self-awareness/recompute`);
    console.log(`[opsoul-api] Platform Skills: /api/platform-skills — CRUD skill library`);
    console.log(`[opsoul-api] Operator Skills: /api/operators/:id/skills — install, list, patch, delete`);
    console.log(`[opsoul-api] Integrations: /api/operators/:id/integrations — register, list, patch, delete`);
    console.log(`[opsoul-api] Mission Contexts: /api/operators/:id/mission-contexts — CRUD + activate`);
    console.log(`[opsoul-api] Memory: /api/operators/:id/memory — store, list, search, distill, decay`);
  });

  startGrowCron();
  startMemoryCron();
  startDriftCron();
}

start().catch((err) => {
  console.error('[opsoul-api] Fatal startup error:', err);
  process.exit(1);
});
