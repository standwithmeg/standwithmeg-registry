import { readFile } from "node:fs/promises";
import path from "node:path";
import { task, logger } from "@trigger.dev/sdk/v3";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Phase 2 proof-run: put a state's CURRENT PDF into R2 object storage.
 *
 * This is the first brick of the artifact pipeline — it doesn't generate
 * anything yet (generation moves here next); it takes the already-built PDF
 * from public/state-reports and uploads it to the swm-artifacts bucket under
 * a versioned, immutable path. Once generation + the artifact_versions table
 * land, this same shape becomes the backfill job for every state.
 */

function r2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials missing: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export const backfillStatePdf = task({
  id: "backfill-state-pdf",
  maxDuration: 300,
  run: async (payload: { state: string; version?: number }) => {
    const state = payload.state.toUpperCase();
    const version = payload.version ?? 1;
    const bucket = process.env.R2_BUCKET || "swm-artifacts";

    const localPath = path.join(process.cwd(), "public", "state-reports", `${state}.pdf`);
    logger.log("Reading current generated PDF", { localPath });
    const body = await readFile(localPath);

    const key = `state-reports/${state}/v${version}/${state}.pdf`;
    logger.log("Uploading to R2", { bucket, key, bytes: body.byteLength });

    await r2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/pdf",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    logger.log("Upload complete", { key });
    return {
      state,
      version,
      bucket,
      key,
      bytes: body.byteLength,
      note: "PDF is now in object storage — this exact shape becomes the all-states backfill job",
    };
  },
});
