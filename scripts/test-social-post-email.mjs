import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const unexpected = () => { throw new Error("Unexpected external side effect in offline test"); };

// Execute the real route/helpers with explicit offline boundaries. No credentials,
// database, network, or real Gmail clients are available to these modules.
function load(file, dependencies = {}, globals = {}) {
  const filename = fileURLToPath(new URL(file, root));
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Buffer, Error, Request, Response, URL,
    process: { env: {} },
    console: { error() {} },
    fetch: unexpected,
    require(id) {
      assert.ok(Object.hasOwn(dependencies, id), `Unmocked dependency: ${id}`);
      return dependencies[id];
    },
    ...globals,
  }, { filename });
  return exports;
}

const actor = { name: "Test Actor", role: "Judge", location_key: "ZZ" };
const pkg = {
  actor_name: actor.name, actor_bucket_key: "test actor|zz", actor_slug: "test-actor",
  state_abbr: "ZZ", role: "Judge", county: null, family_count: 3, content_signature: "new",
};

function stagingHarness(existing = null, secret = "test-secret", mailbox = "reviewer@example.test") {
  const writes = [];
  const logs = [];
  const client = { rpc: async () => ({ error: null }) };
  const queue = new Map(existing ? [[pkg.actor_bucket_key, existing]] : []);
  const write = async row => {
    writes.push(row);
    const saved = { ...row, id: "test-queue-id" };
    queue.set(row.actor_bucket_key, saved);
    return saved;
  };
  const stage = load("lib/social-post/stage.ts", {
    "../court-actors": { actorBucketKeyWithLocation: () => pkg.actor_bucket_key },
    "../gmail": { targetGmailMailboxEmail: () => mailbox, getGmailClient: unexpected, sendEmail: unexpected },
    "../supabase-admin": { createAdminSupabaseClient: () => client },
    "./db": {
      getQueuedPostsByBucketKey: async () => queue,
      insertQueuedPost: write,
      replaceQueuePost: async (_key, row) => write(row),
      logAction: async row => logs.push(row),
      updateQueueEmailDeliveryFailure: unexpected,
      updateQueueEmailSentMessageId: unexpected,
    },
    "./email": { buildApprovalEmail: unexpected },
    "./in-flight": load("lib/social-post/in-flight.ts"),
    "./package": { buildSocialPostPackage: async () => ({ ok: true, package: pkg }) },
    "./signature": { socialPostPackageSignature: unexpected },
    "../../app/api/survey/court-actors/route": {
      computePublicActorsDirect: async () => [actor],
      expirePublicActorCache: async () => {},
    },
  });
  const autoQueue = load("lib/social-post/auto-queue-today.ts", {
    "./stage": stage,
    "./discover": {
      discoverSocialPostCandidates: async () => ({}),
      crossedThresholdTodayCandidates: () => [{ ...pkg, likely_stageable: true, has_photo: true }],
      invalidateDiscoverCache() {},
    },
  });
  const route = load("app/api/cron/auto-stage-court-actor-posts/route.ts", {
    "../../../../lib/social-post/auto-queue-today": autoQueue,
    "../../../../lib/social-post/stage": stage,
  }, { process: { env: { CRON_SECRET: secret } } });
  return { ...route, writes, logs };
}

function cronRequest(query = "", token = "test-secret") {
  return new Request(`https://example.test/api/cron/auto-stage-court-actor-posts${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

for (const query of ["", "?skip_email=false", "?skip_email=true", "?requeue_all=true"]) {
  test(`daily staging persists queue entries without Gmail access: ${query || "default"}`, async () => {
    const harness = stagingHarness();
    const response = await harness.GET(cronRequest(query));
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.auto_queued_today.queued, 1);
    assert.equal(result.emails_sent, 0);
    assert.deepEqual(result.email_errors, []);
    assert.ok(harness.writes.length >= 1);
    assert.equal(harness.writes[0].status, "pending_review");
    assert.equal(harness.writes[0].package_json.actor_bucket_key, pkg.actor_bucket_key);
    assert.equal(harness.logs[0].action, "staged");
    // An identical second run must not insert a duplicate row.
    if (!query.includes("requeue_all")) {
      await harness.GET(cronRequest(query));
      assert.equal(harness.writes.length, 1);
    }
  });
}

test("dry run previews the queue without writing or emailing", async () => {
  const harness = stagingHarness();
  const response = await harness.GET(cronRequest("?dry_run=true&skip_email=false"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.staged.length, 1);
  assert.equal(result.auto_queued_today.queued, 0);
  assert.equal(result.emails_sent, 0);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.logs.length, 0);
});

test("daily staging also works when no approval mailbox is configured", async () => {
  const harness = stagingHarness(null, "test-secret", "");
  const response = await harness.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.equal(harness.writes.length, 1);
});

test("unauthorized and unconfigured cron requests do nothing", async () => {
  for (const secret of ["test-secret", undefined]) {
    const harness = stagingHarness(null, secret === undefined ? "" : secret);
    const response = await harness.GET(cronRequest("", "wrong-secret"));
    assert.equal(response.status, 401);
    assert.equal(harness.writes.length, 0);
  }
});

for (const status of ["posted", "rejected"]) {
  test(`silent staging preserves ${status} history on a metadata refresh`, async () => {
    const harness = stagingHarness({ status, package_json: { ...pkg, content_signature: "old" } });
    const response = await harness.GET(cronRequest());
    assert.equal(response.status, 200);
    assert.equal(harness.writes.length, 1);
    assert.equal(harness.writes[0].status, status);
  });
}

test("silent staging preserves a scheduled platform submission", async () => {
  const harness = stagingHarness({
    status: "approved_to_post", package_json: { ...pkg, content_signature: "old" },
    review_notes: JSON.stringify({ platforms: [{ platform: "instagram", submissionId: "scheduled-id" }] }),
  });
  const response = await harness.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.equal(harness.writes.length, 0);
});

test("staging failures return an error instead of claiming success", async () => {
  const route = load("app/api/cron/auto-stage-court-actor-posts/route.ts", {
    "../../../../lib/social-post/auto-queue-today": { autoQueueCrossedTodayWithPhotos: async () => { throw new Error("Queue unavailable"); } },
    "../../../../lib/social-post/stage": { stageCourtActorSocialPosts: unexpected },
  }, { process: { env: { CRON_SECRET: "test-secret" } } });
  const response = await route.GET(cronRequest());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Queue unavailable" });
});

function gmailHarness(status = 200) {
  const requests = [];
  const gmail = load("lib/gmail.ts", {
    "google-auth-library": { OAuth2Client: unexpected },
    "./supabase-admin": { createAdminSupabaseClient: unexpected },
    "nodemailer/lib/mail-composer": require("nodemailer/lib/mail-composer"),
  }, {
    fetch: async (url, init) => {
      if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
        return Response.json({ email: "sender@example.test" });
      }
      assert.match(url, /^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/(messages\/send|drafts)$/);
      requests.push({ url, body: JSON.parse(init.body) });
      return Response.json({ id: "offline-id" }, { status });
    },
  });
  const client = { credentials: { access_token: "offline-token" }, getAccessToken: async () => ({ token: "offline-token" }) };
  return { gmail, client, requests };
}

const payload = {
  to: "recipient@example.test", subject: "Court Actor review · KS — café",
  body: "<p>Review café — thank you.</p>", replyTo: "replies@example.test",
  inReplyTo: "<original@example.test>", references: "<original@example.test>", threadId: "test-thread",
};

function decodeQuotedPrintable(value) {
  return Buffer.from(value.replace(/=\r\n/g, "").replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8");
}

function verifyMime(raw, expected = payload) {
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const message = Buffer.from(raw, "base64url").toString("utf8");
  const boundary = message.indexOf("\r\n\r\n");
  assert.ok(boundary > 0, "MIME headers must be separated from the message body");
  const headers = message.slice(0, boundary).replace(/\r\n[ \t]+/g, " ");
  const body = message.slice(boundary + 4);
  const subject = headers.match(/^Subject: (.*)$/m)[1].trim()
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, encoding, text) => encoding.toUpperCase() === "B"
      ? Buffer.from(text, "base64").toString("utf8") : decodeQuotedPrintable(text.replace(/_/g, " ")));
  assert.equal(subject, expected.subject);
  assert.match(headers, /From: Stand With Meg <sender@example\.test>/);
  assert.match(headers, /To: recipient@example\.test/);
  assert.match(headers, /Reply-To: replies@example\.test/);
  assert.match(headers, /In-Reply-To: <original@example\.test>/);
  assert.match(headers, /References: <original@example\.test>/);
  assert.match(headers, /Message-ID: <[^>]+>/);
  assert.match(headers, /^Date: .+/m);
  assert.match(headers, /Content-Type: text\/html; charset=utf-8/i);
  const decodedBody = /Content-Transfer-Encoding: base64/i.test(headers)
    ? Buffer.from(body, "base64").toString("utf8") : decodeQuotedPrintable(body);
  assert.equal(decodedBody.trimEnd(), expected.body);
}

for (const method of ["sendEmail", "createDraft"]) {
  test(`${method} preserves HTML, Unicode, addresses, and reply threading`, async () => {
    const { gmail, client, requests } = gmailHarness();
    await gmail[method](client, payload);
    assert.equal(requests.length, 1);
    const message = method === "createDraft" ? requests[0].body.message : requests[0].body;
    assert.equal(message.threadId, payload.threadId);
    verifyMime(message.raw);
  });
}

test("Gmail errors propagate to the caller", async () => {
  const { gmail, client } = gmailHarness(403);
  await assert.rejects(gmail.sendEmail(client, payload), /Gmail API 403/);
});

test("long Unicode subjects and multiline HTML survive MIME line folding", async () => {
  const { gmail, client, requests } = gmailHarness();
  const longPayload = {
    ...payload,
    subject: `Approve post: ${"Custody Evaluator / Reunification Therapist / ".repeat(4)}Test Actor · KS — café`,
    body: "<h1>Review</h1>\r\n\r\n<p>café — please review.</p>",
  };
  await gmail.sendEmail(client, longPayload);
  verifyMime(requests[0].body.raw, longPayload);
});

test("mail without an authenticated or explicit sender is rejected before sending", async () => {
  const { gmail, client, requests } = gmailHarness();
  client.credentials = {};
  await assert.rejects(gmail.sendEmail(client, payload), /requires a From address/);
  await assert.rejects(gmail.createDraft(client, payload), /no From address/);
  assert.equal(requests.length, 0);
});
