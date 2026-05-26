import { Resend } from "resend";

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicLink = `${baseUrl}/api/auth/verify?token=${token}`;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    subject: "Your login link for Fridge Explorer",
    text: `Click this link to sign in:\n\n${magicLink}\n\nThis link expires in 15 minutes.`,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
