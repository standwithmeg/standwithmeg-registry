import assert from "node:assert/strict";
import test from "node:test";
import { inFlightSocialPlatforms } from "./in-flight";

test("finds accepted submissions that have not published or failed", () => {
  const notes = JSON.stringify({
    kind: "blotato",
    platforms: [
      { platform: "tiktok", submissionId: "scheduled-1", url: null },
      { platform: "twitter", submissionId: "publishing-1", url: null, verificationNeeded: "lookup pending" },
      { platform: "facebook", submissionId: "done-1", url: "https://facebook.com/posts/1" },
      { platform: "instagram", submissionId: "failed-1", url: null, error: "rejected" },
    ],
  });

  assert.deepEqual(inFlightSocialPlatforms(notes), ["tiktok", "x"]);
});

test("ignores legacy text and malformed envelopes", () => {
  assert.deepEqual(inFlightSocialPlatforms("old pipeline note"), []);
  assert.deepEqual(inFlightSocialPlatforms(JSON.stringify({ platforms: "tiktok" })), []);
  assert.deepEqual(inFlightSocialPlatforms(null), []);
});
