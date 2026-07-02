const NOTIFY_TO = "meg@standwithmeg.com";

export type PartnerPortalRecord = {
  record_type: "sponsor_submission" | "prospect";
  status?: string;
  partner_name?: string | null;
  partner_email?: string | null;
  partner_state?: string | null;
  business_name: string;
  display_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  website?: string | null;
  requested_tier?: string | null;
  quoted_price?: string | null;
  state_placement?: string | null;
  law_firm_status?: string | null;
  logo_status?: string | null;
  logo_file_name?: string | null;
  logo_file_size?: number | null;
  logo_content_type?: string | null;
  logo_link_notes?: string | null;
  ad_wording?: string | null;
  public_contact_line?: string | null;
  business_description?: string | null;
  conversation_notes?: string | null;
  prospect_stage?: string | null;
  interest_level?: string | null;
  best_signal?: string | null;
  next_follow_up?: string | null;
};

type Attachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type Transport = {
  sendMail: (opts: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
    attachments?: Attachment[];
  }) => Promise<unknown>;
};

async function getTransport(): Promise<{ transport: Transport; from: string }> {
  const smtpUser = process.env.GOOGLE_SMTP_USER;
  const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
  const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
  if (!smtpUser || !smtpPass || !fromAddress) {
    throw new Error("Partner portal email skipped: SMTP environment is not configured.");
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });
  return { transport, from: fromAddress };
}

function line(label: string, value: unknown): string {
  const clean = value == null || value === "" ? "-" : String(value);
  return `${label}: ${clean}`;
}

export async function sendPartnerPortalRecordEmail(
  record: PartnerPortalRecord,
  attachments: Attachment[] = []
): Promise<void> {
  const { transport, from } = await getTransport();
  const isSponsor = record.record_type === "sponsor_submission";
  const title = isSponsor ? "New partner sponsor submission" : "New partner prospect";
  const lines = [
    `${title}:`,
    "",
    line("Business", record.business_name),
    line("Display name", record.display_name),
    line("Contact", record.contact_name),
    line("Contact email", record.contact_email),
    line("Phone", record.phone),
    line("Website/social", record.website),
    "",
    line("Partner", record.partner_name),
    line("Partner email", record.partner_email),
    line("Partner state", record.partner_state),
    "",
    line("Requested tier", record.requested_tier),
    line("Quoted price", record.quoted_price),
    line("State/placement", record.state_placement),
    line("Law firm/attorney", record.law_firm_status),
    "",
    line("Logo status", record.logo_status),
    line("Logo file", record.logo_file_name),
    line("Logo notes/link", record.logo_link_notes),
    "",
    line("Ad wording/tagline", record.ad_wording),
    line("Public contact line", record.public_contact_line),
    line("Business description/mission fit", record.business_description),
    line("Conversation notes", record.conversation_notes),
    "",
    line("Prospect stage", record.prospect_stage),
    line("Interest level", record.interest_level),
    line("Best signal", record.best_signal),
    line("Next follow-up", record.next_follow_up),
    "",
    "Admin inbox:",
    "https://my.standwithmeg.com/partner-portal/admin.html",
  ].join("\n");

  await transport.sendMail({
    from: `"Stand With Meg Partner Portal" <${from}>`,
    to: NOTIFY_TO,
    replyTo: record.partner_email || record.contact_email || undefined,
    subject: `${title} - ${record.business_name}`,
    text: lines,
    attachments,
  });
}
