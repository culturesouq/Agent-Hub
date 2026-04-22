const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@opsoul.io';

  console.log(`[email] sendEmail called → to=${to} subject="${subject}"`);

  if (!apiKey) {
    console.error('[email] SENDGRID_API_KEY is NOT set — cannot send email');
    return;
  }

  console.log(`[email] Sending via SendGrid from=${from}`);

  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: 'OpSoul' },
    subject,
    content: [{ type: 'text/html', value: html }],
  });

  try {
    const res = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (res.ok) {
      console.log(`[email] ✓ Sent successfully to ${to} (HTTP ${res.status})`);
    } else {
      const text = await res.text();
      console.error(`[email] SendGrid error ${res.status}:`, text);
    }
  } catch (err) {
    console.error('[email] Network error sending to', to, err);
  }
}

export function forgotPasswordEmail(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your OpSoul password</title>
</head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#13131f;border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 28px;border-bottom:1px solid #1e1e30;">
              <span style="font-size:22px;font-weight:700;color:#c4b5fd;letter-spacing:-0.5px;">OpSoul</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:600;color:#f1f1f5;">Reset your password</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#8e8ea0;">
                We received a request to reset the password for your OpSoul account.
                Click the button below to choose a new password.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#7c3aed;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#5e5e72;">
                This link expires in <strong style="color:#a78bfa;">1 hour</strong>.
                If you didn't request a password reset, you can safely ignore this email —
                your account remains secure.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e1e30;">
              <p style="margin:0;font-size:12px;color:#3d3d52;">
                © ${new Date().getFullYear()} OpSoul. All rights reserved.
                &nbsp;·&nbsp;
                <a href="https://opsoul.io/privacy" style="color:#7c3aed;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#3d3d52;">
          If the button above doesn't work, copy and paste this URL into your browser:<br />
          <a href="${resetUrl}" style="color:#7c3aed;word-break:break-all;">${resetUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function telegramWebhookFailureEmail(reason: string, dashboardUrl: string): string {
  const safeReason = escapeHtml(reason);
  const safeDashboardUrl = escapeHtml(dashboardUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Telegram bot connection failed</title>
</head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#13131f;border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 28px;border-bottom:1px solid #1e1e30;">
              <span style="font-size:22px;font-weight:700;color:#c4b5fd;letter-spacing:-0.5px;">OpSoul</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:600;color:#f1f1f5;">Telegram bot failed to connect</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#8e8ea0;">
                Your Telegram bot's webhook could not be registered with Telegram. Your bot will not receive messages until this is resolved.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;width:100%;">
                <tr>
                  <td style="background:#1a0a0a;border:1px solid #3d1515;border-radius:8px;padding:16px;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#f87171;text-transform:uppercase;letter-spacing:0.5px;">Error from Telegram</p>
                    <p style="margin:0;font-size:14px;line-height:1.5;color:#fca5a5;font-family:monospace;">${safeReason}</p>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#7c3aed;">
                    <a href="${safeDashboardUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Go to dashboard to retry
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#5e5e72;">
                Check that your bot token is correct and that the bot hasn't been revoked via BotFather.
                Questions? Reach us at
                <a href="mailto:privacy@opsoul.io" style="color:#a78bfa;text-decoration:none;">privacy@opsoul.io</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e1e30;">
              <p style="margin:0;font-size:12px;color:#3d3d52;">
                © ${new Date().getFullYear()} OpSoul. All rights reserved.
                &nbsp;·&nbsp;
                <a href="https://opsoul.io/privacy" style="color:#7c3aed;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeEmail(name: string): string {
  const displayName = name || 'there';
  const dashboardUrl = 'https://opsoul.io';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to OpSoul</title>
</head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#13131f;border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 28px;border-bottom:1px solid #1e1e30;">
              <span style="font-size:22px;font-weight:700;color:#c4b5fd;letter-spacing:-0.5px;">OpSoul</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:600;color:#f1f1f5;">Welcome, ${displayName}.</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#8e8ea0;">
                Your OpSoul workspace is ready. You can now create and train AI operators,
                shape their identities, connect them to your tools, and watch them evolve
                through the GROW system.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#8e8ea0;">
                Start by creating your first operator from the dashboard.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#7c3aed;">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Go to dashboard
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#5e5e72;">
                Questions? Reach us at
                <a href="mailto:privacy@opsoul.io" style="color:#a78bfa;text-decoration:none;">privacy@opsoul.io</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e1e30;">
              <p style="margin:0;font-size:12px;color:#3d3d52;">
                © ${new Date().getFullYear()} OpSoul. All rights reserved.
                &nbsp;·&nbsp;
                <a href="https://opsoul.io/privacy" style="color:#7c3aed;text-decoration:none;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
