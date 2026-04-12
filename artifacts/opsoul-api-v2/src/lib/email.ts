const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@opsoul.io';
  if (!apiKey) { console.error('[email] SENDGRID_API_KEY not set'); return; }
  try {
    const res = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'OpSoul' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!res.ok) console.error(`[email] SendGrid error ${res.status}:`, await res.text());
  } catch (err) { console.error('[email] send failed:', err); }
}

export function forgotPasswordEmail(resetUrl: string): string {
  return `<!DOCTYPE html><html><body style="background:#0d0d14;font-family:sans-serif;padding:40px 16px;">
<table style="max-width:560px;margin:0 auto;background:#13131f;border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 40px;border-bottom:1px solid #1e1e30;"><span style="font-size:20px;font-weight:700;color:#c4b5fd;">OpSoul</span></td></tr>
<tr><td style="padding:32px 40px;">
<h1 style="margin:0 0 12px;font-size:22px;color:#f1f1f5;">Reset your password</h1>
<p style="margin:0 0 24px;font-size:15px;color:#8e8ea0;line-height:1.6;">Click the button below to choose a new password. This link expires in 1 hour.</p>
<a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>
<p style="margin:24px 0 0;font-size:13px;color:#5e5e72;">If you didn't request this, ignore this email — your account is safe.</p>
</td></tr>
</table></body></html>`;
}

export function welcomeEmail(name: string): string {
  const n = name || 'there';
  return `<!DOCTYPE html><html><body style="background:#0d0d14;font-family:sans-serif;padding:40px 16px;">
<table style="max-width:560px;margin:0 auto;background:#13131f;border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 40px;border-bottom:1px solid #1e1e30;"><span style="font-size:20px;font-weight:700;color:#c4b5fd;">OpSoul</span></td></tr>
<tr><td style="padding:32px 40px;">
<h1 style="margin:0 0 12px;font-size:22px;color:#f1f1f5;">Welcome, ${n}.</h1>
<p style="margin:0 0 24px;font-size:15px;color:#8e8ea0;line-height:1.6;">Your OpSoul workspace is ready. Create your first operator from the dashboard.</p>
<a href="https://opsoul.io" style="display:inline-block;padding:14px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Go to dashboard</a>
</td></tr>
</table></body></html>`;
}
