export type EmailContent = { subject: string; html: string; text: string };

// Inline styles only — email clients don't run a stylesheet. Kept
// deliberately plain (CLAUDE.md's design voice applies here too: minimal,
// technical, not a marketing template) — one message, one link, nothing
// else competing for attention.
function wrap(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 24px;background:#f3f1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17171a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:24px;font-size:17px;font-weight:700;letter-spacing:-.02em;">Dynamify</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e7e4e0;border-radius:12px;padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// 1 hour, matching RESET_TOKEN_DURATION_MS in src/lib/auth/service.ts —
// kept as a display string here rather than importing that constant, since
// this module has no reason to depend on auth internals for a number that
// only needs to read correctly to a human.
const RESET_LINK_VALID_FOR = "1 hour";

export function passwordResetEmail(resetUrl: string): EmailContent {
  const subject = "Reset your Dynamify password";

  const html = wrap(`
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Someone requested a password reset for this email address.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">If this was you, set a new password:</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:8px;background:#17171a;">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Set a new password</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6f6e6a;">This link works once and expires in ${RESET_LINK_VALID_FOR}. If you didn't request this, you can ignore this email — your password hasn't changed.</p>
  `);

  const text = [
    "Someone requested a password reset for this email address.",
    "",
    "If this was you, set a new password here:",
    resetUrl,
    "",
    `This link works once and expires in ${RESET_LINK_VALID_FOR}. If you didn't request this, you can ignore this email — your password hasn't changed.`,
  ].join("\n");

  return { subject, html, text };
}
