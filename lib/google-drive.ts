import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a valid Google access token for the given user.
 * If the stored token is within 60 seconds of expiry, it refreshes first
 * and updates the google_connections row.
 */
export async function getValidAccessToken(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const { data: conn, error } = await supabase
    .from("google_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !conn) {
    throw new Error("No Google connection found for this user.");
  }

  const expiresAt = new Date(conn.token_expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() < 60_000; // refresh if < 60s left

  if (!needsRefresh) {
    return conn.access_token;
  }

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const refreshed = await res.json();
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;      // Drive returns size as string; null for Google Docs
  modifiedTime: string;
};

/**
 * Lists the user's Drive files — PDFs, Google Docs, Word docs — most recently
 * modified first, up to pageSize results.
 */
export async function listDriveFiles(
  accessToken: string,
  pageSize = 50,
  searchQuery = ""
): Promise<DriveFile[]> {
  const mimeFilter = [
    "mimeType='application/pdf'",
    "mimeType='application/vnd.google-apps.document'",
    "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
  ].join(" or ");

  const nameFilter = searchQuery.trim()
    ? ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`
    : "";

  const q = encodeURIComponent(`trashed=false and (${mimeFilter})${nameFilter}`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime),nextPageToken");

  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${q}&fields=${fields}&pageSize=${pageSize}&orderBy=modifiedTime+desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive files list failed: ${body}`);
  }

  const data = await res.json();
  return (data.files ?? []) as DriveFile[];
}

/**
 * Downloads or exports a Drive file and returns its raw bytes.
 * - PDFs and Word docs: downloaded directly via alt=media
 * - Google Docs: exported as plain text
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<{ buffer: ArrayBuffer; exportedMime: string }> {
  const isGoogleDoc = mimeType === "application/vnd.google-apps.document";

  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive download failed for ${fileId}: ${body}`);
  }

  const buffer = await res.arrayBuffer();
  return {
    buffer,
    exportedMime: isGoogleDoc ? "text/plain" : mimeType,
  };
}

/** Maps Drive MIME types to human-readable doc types */
export function mimeToDocType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/vnd.google-apps.document":
      return "Google Doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "Word Doc";
    default:
      return "Document";
  }
}
