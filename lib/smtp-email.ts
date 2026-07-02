export type SmtpConfigOverrides = {
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
  replyToAddress?: string;
};

export type SmtpRuntimeConfig = {
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  replyToAddress: string;
  host: string;
  port: number;
  secure: boolean;
};

function parsePort(value: string | undefined): number {
  if (!value) return 587;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function parseSecure(value: string | undefined, port: number): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return port === 465;
}

export function resolveSmtpConfig(
  context: string,
  overrides: SmtpConfigOverrides = {},
): SmtpRuntimeConfig {
  const smtpUser = overrides.smtpUser || process.env.GOOGLE_SMTP_USER;
  const smtpPass = overrides.smtpPass || process.env.GOOGLE_SMTP_PASSWORD;
  const fromAddress = overrides.fromAddress || process.env.GOOGLE_SMTP_FROM || smtpUser;
  const replyToAddress = overrides.replyToAddress || process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseSecure(process.env.SMTP_SECURE, port);

  const missing = [
    !smtpUser ? "GOOGLE_SMTP_USER" : null,
    !smtpPass ? "GOOGLE_SMTP_PASSWORD" : null,
    !fromAddress ? "GOOGLE_SMTP_FROM" : null,
  ].filter(Boolean);

  if (missing.length > 0 || !smtpUser || !smtpPass || !fromAddress || !replyToAddress) {
    throw new Error(`${context} email skipped: missing SMTP env ${missing.join(", ")}.`);
  }

  return {
    smtpUser,
    smtpPass,
    fromAddress,
    replyToAddress,
    host,
    port,
    secure,
  };
}

export async function createSmtpTransport(
  context: string,
  overrides: SmtpConfigOverrides = {},
) {
  const config = resolveSmtpConfig(context, overrides);
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return { transporter, ...config };
}

export function summarizeEmailError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
