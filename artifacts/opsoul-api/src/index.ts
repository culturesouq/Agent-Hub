import { validateEnv } from '@workspace/opsoul-utils/env';

validateEnv();

import express from 'express';
import path from 'path';
import fs from 'fs';
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
import memoryRouter from './routes/memory.js';
import capabilityRequestsRouter from './routes/capability-requests.js';
import tasksRouter from './routes/tasks.js';
import uploadRouter from './routes/upload.js';
import transcribeRouter from './routes/transcribe.js';
import operatorFilesRouter from './routes/operatorFiles.js';
import adminRouter from './routes/admin.js';
import adminRagRouter from './routes/adminRag.js';
import contactRouter from './routes/contact.js';
import googleIntegrationRouter from './routes/google-integration.js';
import operatorSecretsRouter from './routes/operator-secrets.js';
import deploymentSlotsRouter from './routes/deployment-slots.js';
import publicChatRouter from './routes/public-chat.js';
import publicCrudRouter from './routes/public-crud.js';
import { startGrowCron } from './cron/growCron.js';
import { startMemoryCron } from './cron/memoryCron.js';
import { startDriftCron } from './cron/driftCron.js';
import { startKeepAliveCron } from './cron/keepAliveCron.js';
import { runInitSeed } from './utils/initSeed.js';
import { backfillIntegrationSkills } from './utils/autoInstallIntegrationSkills.js';

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
app.use('/api/operators/:operatorId/memory', memoryRouter);
app.use('/api/operators/:operatorId/capability-requests', capabilityRequestsRouter);
app.use('/api/operators/:operatorId/tasks', tasksRouter);
app.use('/api/operators/:operatorId/files', operatorFilesRouter);
app.use('/api/platform-skills', platformSkillsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/rag', adminRagRouter);
app.use('/api/contact', contactRouter);
app.use('/api/integrations/google', googleIntegrationRouter);
app.use('/api/operators/:operatorId/secrets', operatorSecretsRouter);
app.use('/api/operators/:operatorId/slots', deploymentSlotsRouter);
app.use('/v1/chat', publicChatRouter);
app.use('/v1/action', publicCrudRouter);

app.get('/api/healthz', (_req, res) => {
  // Fire a non-blocking DB ping to keep the Neon endpoint warm.
  // This prevents the endpoint from suspending, which blocks redeployment.
  pool.query('SELECT 1').catch(() => {/* non-fatal — endpoint may be waking up */});
  res.json({ status: 'ok', service: 'opsoul-api', phase: 8 });
});

// Serve frontend static files in production
// pnpm runs with cwd = artifacts/opsoul-api, so go up 2 levels to workspace root
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), '../../artifacts/opsoul-hub/dist/public');
  console.log(`[opsoul-api] Static distPath: ${distPath} (exists: ${fs.existsSync(distPath)})`);
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[opsoul-api] Serving frontend static files from', distPath);
  } else {
    console.warn('[opsoul-api] WARNING: Frontend dist not found — frontend will not be served');
  }
}

const SOVEREIGN_ADMIN_EMAIL = 'mohamedhajeri887@gmail.com';

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

  try {
    const result = await pool.query(
      `UPDATE owners SET is_sovereign_admin = true WHERE email = $1 AND is_sovereign_admin = false RETURNING email`,
      [SOVEREIGN_ADMIN_EMAIL],
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[db] Sovereign admin access granted to ${SOVEREIGN_ADMIN_EMAIL}`);
    }
  } catch (err) {
    console.error('[db] Failed to bootstrap sovereign admin:', (err as Error).message);
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
    console.log(`[opsoul-api] Memory: /api/operators/:id/memory — store, list, search, distill, decay`);
    console.log(`[opsoul-api] Operator Secrets: /api/operators/:id/secrets — list, save, reveal, delete`);
    console.log(`[opsoul-api] Deployment Slots: /api/operators/:id/slots — create, list, patch, revoke`);
    console.log(`[opsoul-api] Public Chat: POST /v1/chat — slot-key authenticated, guest/authenticated surfaces`);
    console.log(`[opsoul-api] Public CRUD: POST /v1/action — slot-key authenticated, crud surface only`);
  });

  runInitSeed().catch((err) => console.error('[initSeed] failed:', err?.message));
  backfillIntegrationSkills().catch((err) => console.error('[autoInstall] backfill failed:', err?.message));

  startGrowCron();
  startMemoryCron();
  startDriftCron();
  startKeepAliveCron();
}

start().catch((err) => {
  console.error('[opsoul-api] Fatal startup error:', err);
  process.exit(1);
});
