import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

/** Sends an email, or prints it to the console when no SMTP server is configured. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    console.log(`\n[mail] (no SMTP configured)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, text });
}
