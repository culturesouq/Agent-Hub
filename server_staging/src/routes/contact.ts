import { Router } from 'express';
import { pool } from '@workspace/db';
import { randomUUID } from 'crypto';

const router = Router();

router.post('/', async (req, res): Promise<void> => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO contact_submissions (id, name, email, subject, message, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [randomUUID(), name, email, subject || 'General Inquiry', message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[contact]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
