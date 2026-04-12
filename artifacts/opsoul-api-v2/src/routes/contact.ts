import { Router } from 'express';

const router = Router();

router.post('/', async (req, res): Promise<void> => {
  const { name, email, subject, message } = req.body as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
  };

  if (!name || !email || !message) {
    res.status(400).json({ error: 'Missing required fields: name, email, message' });
    return;
  }

  console.log(`[contact] From: ${name} <${email}> | Subject: ${subject ?? 'General Inquiry'} | ${message.slice(0, 200)}`);

  res.json({ success: true });
});

export default router;
