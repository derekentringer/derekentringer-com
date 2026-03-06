import { Resend } from "resend";
import { loadConfig } from "../config.js";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const config = loadConfig();
    resendClient = new Resend(config.resendApiKey);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  appUrl: string,
): Promise<void> {
  const resend = getResend();
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

  await resend.emails.send({
    from: "NoteSync <noreply@derekentringer.com>",
    to: email,
    subject: "Reset your NoteSync password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #d4e157; margin-bottom: 24px;">NoteSync</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.5;">
          You requested a password reset. Click the button below to set a new password.
        </p>
        <a href="${resetLink}" style="display: inline-block; background: #d4e157; color: #1a1a2e; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">
          If the button doesn't work, copy and paste this link:<br>
          <a href="${resetLink}" style="color: #d4e157;">${resetLink}</a>
        </p>
      </div>
    `,
  });
}
