import { OAuth2Client, type Credentials } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer";
import { createAdminSupabaseClient } from "./supabase-admin";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

type GmailCredentialSource = "GMAIL" | "GOOGLE";

type GmailCredentialDiagnostics = {
  source: GmailCredentialSource | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  clientIdSuffix: string | null;
  clientIdLooksValid: boolean;
  gmailClientIdSet: boolean;
  gmailClientIdLooksValid: boolean;
  googleClientIdSet: boolean;
  googleClientIdLooksValid: boolean;
  redirectUri: string;
  hasRedirectUri: boolean;
};

function isGoogleOAuthClientId(value: string | undefined): value is string {
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(value ?? "");
}

function clientIdSuffix(value: string | undefined) {
  return value && value.length > 12 ? value.slice(-20) : null;
}

export function getGmailCredentialDiagnostics(): GmailCredentialDiagnostics {
  const redirectUri = process.env.GMAIL_REDIRECT_URI || "https://my.standwithmeg.com/api/gmail/callback";
  const gmailClientId = process.env.GMAIL_CLIENT_ID?.trim();
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const gmailClientIdLooksValid = isGoogleOAuthClientId(gmailClientId);
  const googleClientIdLooksValid = isGoogleOAuthClientId(googleClientId);

  if (gmailClientIdLooksValid && gmailClientSecret) {
    return {
      source: "GMAIL",
      hasClientId: true,
      hasClientSecret: true,
      clientIdSuffix: clientIdSuffix(gmailClientId),
      clientIdLooksValid: true,
      gmailClientIdSet: !!gmailClientId,
      gmailClientIdLooksValid,
      googleClientIdSet: !!googleClientId,
      googleClientIdLooksValid,
      redirectUri,
      hasRedirectUri: !!process.env.GMAIL_REDIRECT_URI,
    };
  }

  if (googleClientIdLooksValid && googleClientSecret) {
    return {
      source: "GOOGLE",
      hasClientId: true,
      hasClientSecret: true,
      clientIdSuffix: clientIdSuffix(googleClientId),
      clientIdLooksValid: true,
      gmailClientIdSet: !!gmailClientId,
      gmailClientIdLooksValid,
      googleClientIdSet: !!googleClientId,
      googleClientIdLooksValid,
      redirectUri,
      hasRedirectUri: !!process.env.GMAIL_REDIRECT_URI,
    };
  }

  return {
    source: null,
    hasClientId: !!gmailClientId || !!googleClientId,
    hasClientSecret: !!gmailClientSecret || !!googleClientSecret,
    clientIdSuffix: clientIdSuffix(gmailClientId ?? googleClientId),
    clientIdLooksValid: gmailClientIdLooksValid || googleClientIdLooksValid,
    gmailClientIdSet: !!gmailClientId,
    gmailClientIdLooksValid,
    googleClientIdSet: !!googleClientId,
    googleClientIdLooksValid,
    redirectUri,
    hasRedirectUri: !!process.env.GMAIL_REDIRECT_URI,
  };
}

function getGmailCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const diagnostics = getGmailCredentialDiagnostics();
  const gmailClientId = process.env.GMAIL_CLIENT_ID?.trim();
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (diagnostics.source === "GMAIL" && gmailClientId && gmailClientSecret) {
    return { clientId: gmailClientId, clientSecret: gmailClientSecret, redirectUri: diagnostics.redirectUri };
  }
  if (diagnostics.source === "GOOGLE" && googleClientId && googleClientSecret) {
    return { clientId: googleClientId, clientSecret: googleClientSecret, redirectUri: diagnostics.redirectUri };
  }

  if (!diagnostics.hasClientId || !diagnostics.hasClientSecret) {
    throw new Error(
      "Missing Google OAuth credentials. Set GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.",
    );
  }

  throw new Error(
    "Google OAuth Client ID is not valid. It must end with .apps.googleusercontent.com.",
  );
}

export function createOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getGmailCredentials();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
    state,
  });
}

export async function getTokensFromCode(code: string): Promise<Credentials> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function targetGmailMailboxEmail(fallback?: string | null): string {
  return (
    process.env.SOCIAL_POST_APPROVAL_EMAIL?.trim() ||
    process.env.GOOGLE_SMTP_USER?.trim() ||
    process.env.FOUNDER_EMAIL?.trim() ||
    fallback?.trim() ||
    ""
  );
}

export async function getAuthenticatedGmailEmail(tokens: Credentials): Promise<string | null> {
  if (!tokens.access_token) return null;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { email?: string };
    return data.email?.trim() || null;
  } catch {
    return null;
  }
}

export type StoredTokens = {
  id: string;
  email: string;
  access_token: string | null;
  refresh_token: string;
  expiry_date: string | null;
  scope: string | null;
  token_type: string | null;
};

export async function loadStoredTokens(sb: AdminClient, email: string): Promise<StoredTokens | null> {
  const { data, error } = await sb
    .from("gmail_tokens")
    .select("id, email, access_token, refresh_token, expiry_date, scope, token_type")
    .ilike("email", email)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`Failed to load Gmail tokens: ${error.message}`);
  }
  return (data as StoredTokens | null) ?? null;
}

export async function saveTokens(
  sb: AdminClient,
  email: string,
  tokens: Credentials,
): Promise<void> {
  // Build the update object — only include refresh_token if Google actually gave us a new one.
  // On refresh, Google does NOT return a new refresh_token (it stays undefined).
  // Writing null would permanently destroy the connection.
  const row: Record<string, unknown> = {
    email,
    access_token: tokens.access_token ?? null,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    updated_at: new Date().toISOString(),
  };

  // CRITICAL: Only overwrite refresh_token if we actually received a new one.
  if (tokens.refresh_token) {
    row.refresh_token = tokens.refresh_token;
  }

  const { error } = await sb.from("gmail_tokens").upsert(row, { onConflict: "email" });
  if (error) {
    throw new Error(`Failed to save Gmail tokens: ${error.message}`);
  }
}

// Mutex to prevent concurrent token refreshes for the same email.
// Without this, parallel requests all see the same expired token and all refresh simultaneously,
// causing race conditions that can overwrite valid tokens with stale data.
const refreshMutex = new Map<string, Promise<void>>();

export async function getGmailClient(sb: AdminClient, email: string): Promise<OAuth2Client> {
  const stored = await loadStoredTokens(sb, email);
  if (!stored?.refresh_token) {
    throw new Error("Gmail not authenticated. Visit /api/gmail/auth to connect.");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: stored.access_token ?? undefined,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date ? new Date(stored.expiry_date).getTime() : undefined,
  });

  const expiry = stored.expiry_date ? new Date(stored.expiry_date).getTime() : 0;
  if (!stored.access_token || Date.now() >= expiry - 60_000) {
    // Use mutex to prevent concurrent refreshes for the same email
    const key = email.toLowerCase();
    if (!refreshMutex.has(key)) {
      const refreshPromise = (async () => {
        try {
          // refreshAccessToken() is the only public refresh method on OAuth2Client.
          // It's marked deprecated but is the only accessible API from outside the class.
          // The critical fix is in saveTokens() — it now guards against overwriting
          // refresh_token with null/undefined, which was the real bug causing permanent
          // token destruction on every refresh cycle.
          const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
          await saveTokens(sb, email, newCredentials);
        } finally {
          refreshMutex.delete(key);
        }
      })();
      refreshMutex.set(key, refreshPromise);
    }
    await refreshMutex.get(key);
  }

  return oauth2Client;
}

// --- Lightweight Gmail REST wrappers ---------------------------------------

export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number; attachmentId?: string };
    parts?: GmailMessage["payload"][];
  };
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
  raw?: string;
};

export type GmailThread = {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
};

export type GmailDraft = {
  id: string;
  message?: GmailMessage;
};

type MessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type ThreadListResponse = {
  threads?: Array<{ id: string; snippet: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type DraftListResponse = {
  drafts?: GmailDraft[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

async function gmailApi<T>(
  client: OAuth2Client,
  apiPath: string,
  init: RequestInit = {},
): Promise<T> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Gmail access token is missing.");

  const url = `https://gmail.googleapis.com/gmail/v1${apiPath}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown Gmail API error");
    throw new Error(`Gmail API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function listMessages(
  client: OAuth2Client,
  options: { labelIds?: string[]; maxResults?: number; q?: string } = {},
) {
  const params = new URLSearchParams();
  options.labelIds?.forEach(id => params.append("labelIds", id));
  if (options.maxResults) params.set("maxResults", String(options.maxResults));
  if (options.q) params.set("q", options.q);
  const query = params.toString();
  const { messages } = await gmailApi<MessageListResponse>(
    client,
    `/users/me/messages${query ? `?${query}` : ""}`,
  );
  return messages ?? [];
}

export async function getMessage(
  client: OAuth2Client,
  id: string,
  format: "minimal" | "full" | "raw" = "full",
): Promise<GmailMessage> {
  return gmailApi<GmailMessage>(client, `/users/me/messages/${id}?format=${format}`);
}

export async function listThreads(
  client: OAuth2Client,
  options: { labelIds?: string[]; maxResults?: number; q?: string } = {},
) {
  const params = new URLSearchParams();
  options.labelIds?.forEach(id => params.append("labelIds", id));
  if (options.maxResults) params.set("maxResults", String(options.maxResults));
  if (options.q) params.set("q", options.q);
  const query = params.toString();
  const { threads } = await gmailApi<ThreadListResponse>(
    client,
    `/users/me/threads${query ? `?${query}` : ""}`,
  );
  return threads ?? [];
}

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  /** RFC 5322 From — must match the authenticated Gmail account or a configured send-as alias. */
  from?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

function formatMailboxHeader(name: string | undefined, email: string): string {
  const trimmed = email.trim();
  if (!name?.trim()) return trimmed;
  const safeName = name.replace(/[\r\n"]/g, "").trim();
  return `"${safeName}" <${trimmed}>`;
}

async function encodeEmail(payload: EmailPayload): Promise<string> {
  const { to, subject, body, from, replyTo, inReplyTo, references } = payload;
  if (!from?.trim()) {
    throw new Error("Gmail send requires a From address matching the authenticated mailbox.");
  }
  // Let the MIME composer preserve the header/body separator, encode Unicode
  // subjects and HTML, and add the Date and Message-ID required by mail clients.
  const raw = await new MailComposer({
    from,
    to,
    replyTo: replyTo?.trim() || undefined,
    subject,
    html: body,
    inReplyTo,
    references,
    disableFileAccess: true,
    disableUrlAccess: true,
  }).compile().build();
  return raw.toString("base64url");
}

export function defaultGmailFromAddress(mailboxEmail: string): string {
  const displayName = process.env.GMAIL_FROM_NAME?.trim() || "Stand With Meg";
  return formatMailboxHeader(displayName, mailboxEmail);
}

export function defaultGmailReplyToAddress(mailboxEmail: string): string {
  return (
    process.env.SOCIAL_POST_REPLY_TO?.trim() ||
    process.env.GOOGLE_SMTP_REPLY_TO?.trim() ||
    process.env.FOUNDER_EMAIL?.trim() ||
    mailboxEmail
  );
}

export async function sendEmail(client: OAuth2Client, payload: EmailPayload): Promise<GmailMessage> {
  const mailboxEmail = await getAuthenticatedGmailEmail(client.credentials);
  const from = payload.from?.trim() || (mailboxEmail ? defaultGmailFromAddress(mailboxEmail) : "");
  const replyTo = payload.replyTo?.trim() || (mailboxEmail ? defaultGmailReplyToAddress(mailboxEmail) : undefined);
  return gmailApi<GmailMessage>(client, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: await encodeEmail({ ...payload, from, replyTo }),
      threadId: payload.threadId,
    }),
  });
}

export async function createDraft(client: OAuth2Client, payload: EmailPayload): Promise<GmailDraft> {
  // Ensure a From address is set — encodeEmail throws without one.
  // sendEmail() adds a default from, but createDraft() was missing it.
  const mailboxEmail = await getAuthenticatedGmailEmail(client.credentials);
  const from = payload.from?.trim() || (mailboxEmail ? defaultGmailFromAddress(mailboxEmail) : "");
  if (!from) {
    throw new Error("Cannot create draft: no From address available. Set payload.from or authenticate Gmail first.");
  }
  return gmailApi<GmailDraft>(client, "/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: await encodeEmail({ ...payload, from }),
        threadId: payload.threadId,
      },
    }),
  });
}

export async function listDrafts(client: OAuth2Client, maxResults = 25): Promise<GmailDraft[]> {
  const params = new URLSearchParams();
  params.set("maxResults", String(maxResults));
  const { drafts } = await gmailApi<DraftListResponse>(client, `/users/me/drafts?${params.toString()}`);
  return drafts ?? [];
}

export async function getDraft(client: OAuth2Client, id: string): Promise<GmailDraft> {
  return gmailApi<GmailDraft>(client, `/users/me/drafts/${id}?format=full`);
}

export async function modifyMessageLabels(
  client: OAuth2Client,
  id: string,
  options: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<GmailMessage> {
  return gmailApi<GmailMessage>(client, `/users/me/messages/${id}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: options.addLabelIds ?? [],
      removeLabelIds: options.removeLabelIds ?? [],
    }),
  });
}

export type GmailAttachment = {
  attachmentId: string;
  size: number;
  data?: string;
  filename?: string;
};

export async function getAttachment(
  client: OAuth2Client,
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachment> {
  return gmailApi<GmailAttachment>(
    client,
    `/users/me/messages/${messageId}/attachments/${attachmentId}`,
  );
}

function decodeBase64UrlSafe(input: string): Buffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function attachmentToBuffer(attachment: GmailAttachment): Buffer {
  if (attachment.data) return decodeBase64UrlSafe(attachment.data);
  return Buffer.alloc(0);
}

function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

function isImageFilename(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "heic", "heif", "webp", "gif"].includes(ext);
}

export function findImageAttachments(message: GmailMessage): Array<{
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}> {
  const results: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> = [];
  const seen = new Set<string>();

  function walk(part: GmailMessage["payload"] | undefined) {
    if (!part) return;
    const filename = part.filename ?? "";
    const mimeType = part.mimeType ?? "";
    const attachmentId = part.body?.attachmentId;
    const size = part.body?.size ?? 0;
    if (attachmentId && (isImageMime(mimeType) || (filename && isImageFilename(filename)))) {
      if (!seen.has(attachmentId)) {
        seen.add(attachmentId);
        results.push({
          filename: filename || `attachment-${attachmentId.slice(-8)}`,
          mimeType,
          attachmentId,
          size,
        });
      }
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(message.payload);
  return results;
}
