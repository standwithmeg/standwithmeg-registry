/**
 * Preview / test the public court-actor photo-request email template.
 * Builds the email body using the exact same buildPhotoRequestEmail() the
 * production script uses, and either prints it or sends a single copy
 * via Google Workspace SMTP.
 *
 * Does NOT touch court_actor_public_notifications. Does NOT contact any
 * real reporter unless you pass their address explicitly.
 *
 * Usage:
 *   # Print to stdout only.
 *   npx tsx scripts/preview-photo-request-email.ts --print \
 *       --first-name="Meg" --actor="Keven O'Grady" --location="KS"
 *
 *   # Send a single test copy.
 *   npx tsx scripts/preview-photo-request-email.ts \
 *       --send-to=founder@standwithmeg.com \
 *       --first-name="Meg" --actor="Keven O'Grady" --location="KS"
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

loadDotEnvLocal();

import { buildPhotoRequestEmail } from "../lib/court-actor-public-notifications";

function loadDotEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function arg(name: string): string | null {
  for (const a of process.argv.slice(2)) {
    if (a === name) return "";
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return null;
}

async function main() {
  const sendTo = arg("--send-to");
  const print = arg("--print") !== null;
  const firstName = arg("--first-name");
  const actor = arg("--actor") ?? "Sample Court Actor";
  const location = arg("--location") ?? "XX";

  if (!sendTo && !print) {
    throw new Error(
      "Pass --print to print the email, or --send-to=email@example.com to send a test copy.",
    );
  }

  const { subject, body } = buildPhotoRequestEmail({
    firstName: firstName || null,
    canonicalName: actor,
    locationKey: location,
  });

  console.log("==== EMAIL PREVIEW ====");
  console.log(`Subject: ${subject}`);
  console.log("");
  console.log(body);
  console.log("==== END PREVIEW ====");

  if (!sendTo) return;

  const smtpUser = process.env.GOOGLE_SMTP_USER;
  const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    throw new Error("GOOGLE_SMTP_USER and GOOGLE_SMTP_PASSWORD must be set in .env.local.");
  }
  const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
  const replyToAddress = process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const info = await transporter.sendMail({
    from: `"Stand With Meg" <${fromAddress}>`,
    replyTo: replyToAddress,
    to: sendTo,
    subject,
    text: body,
  });

  console.log(`\nSent test copy to ${sendTo} (messageId=${info.messageId}).`);
  console.log("Note: this preview did NOT write to court_actor_public_notifications.");
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});
