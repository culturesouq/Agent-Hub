import { validateEnv } from '@workspace/opsoul-utils/env';

validateEnv();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pool } from '@workspace/db';
import { ADMIN_AUDIT_LOG_TRIGGER_SQL } from '@workspace/db';
import authRouter from './routes/auth.js';
import operatorsRouter from './routes/operators.js';

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

app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'opsoul-api', phase: 2 });
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
    console.log(`[opsoul-api] Phase 2 running on port ${PORT}`);
    console.log(`[opsoul-api] Auth: /api/auth/{register,login,refresh,logout,change-password,me}`);
    console.log(`[opsoul-api] Operators: /api/operators — CRUD, lock-layer1, soul, soul/reset, grow-lock`);
  });
}

start().catch((err) => {
  console.error('[opsoul-api] Fatal startup error:', err);
  process.exit(1);
});
