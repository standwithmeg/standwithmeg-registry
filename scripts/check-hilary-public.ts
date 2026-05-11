import { createClient } from "@supabase/supabase-js";
import {
  buildPublicCourtActors,
  actorBucketKeyWithLocation,
  COURT_ACTOR_PUBLIC_THRESHOLD,
} from "../lib/court-actors";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1) Pull Hilary's submission + her named actors
  const { data: subs } = await sb
    .from("survey_submissions")
    .select("id, first_name, last_name, email, permission_to_share, approved")
    .ilike("email", "hilarykgold@gmail.com");

  const hilarySub = subs?.[0];
  if (!hilarySub) {
    console.log("No Hilary submission found.");
    return;
  }

  console.log("Hilary's submission:");
  console.log(`  permission_to_share: ${hilarySub.permission_to_share}`);
  console.log(`  approved:            ${hilarySub.approved}`);
  console.log(`  threshold for public display: ${COURT_ACTOR_PUBLIC_THRESHOLD}\n`);

  const { data: hilaryActors } = await sb
    .from("court_actors")
    .select("id, role, name, court_or_county, state_code")
    .eq("submission_id", hilarySub.id);

  console.log(`Hilary named ${hilaryActors?.length ?? 0} actor(s):`);
  for (const a of hilaryActors ?? []) {
    console.log(`  • ${a.name} [${a.role}] — ${a.state_code}`);
  }
  console.log();

  // 2) For each, count how many DIFFERENT families have named them (state-keyed)
  for (const a of hilaryActors ?? []) {
    const locationKey = a.state_code; // OR
    const bucketKey = actorBucketKeyWithLocation(a.name, a.role, locationKey);
    const [nameKey] = bucketKey.split("|");

    // Pull all rows in this state, then filter by normalized bucket
    const { data: stateRows } = await sb
      .from("court_actors")
      .select("id, name, role, court_or_county, state_code, submission_id")
      .eq("state_code", a.state_code);

    const matching = (stateRows ?? []).filter(
      r => actorBucketKeyWithLocation(r.name, r.role, r.state_code).split("|")[0] === nameKey
    );
    const uniqueSubmissions = new Set(matching.map(r => r.submission_id));

    console.log(`── ${a.name} (${a.state_code}) ──`);
    console.log(`  rows matching this normalized name: ${matching.length}`);
    console.log(`  unique submissions (families):      ${uniqueSubmissions.size}`);
    console.log(
      `  publicly visible? ${
        uniqueSubmissions.size >= COURT_ACTOR_PUBLIC_THRESHOLD ? "YES" : "NO"
      } (needs ${COURT_ACTOR_PUBLIC_THRESHOLD})`
    );
    console.log();
  }

  // 3) Build the entire OR public registry and prove neither name appears
  const { data: orRows } = await sb
    .from("court_actors")
    .select("role, name, court_or_county, state_code, submission_id")
    .eq("state_code", "OR");

  const publicOR = buildPublicCourtActors(
    (orRows ?? []).map(r => ({
      role: r.role,
      name: r.name,
      court_or_county: r.court_or_county,
      state_code: r.state_code,
      location_key: r.state_code,
      submission_id: r.submission_id,
    }))
  );

  console.log(`Total OR rows: ${orRows?.length ?? 0}`);
  console.log(`Public OR actors (above threshold): ${publicOR.length}`);
  const flagged = publicOR.filter(p =>
    (hilaryActors ?? []).some(
      h =>
        actorBucketKeyWithLocation(h.name, h.role, h.state_code).split("|")[0] ===
        actorBucketKeyWithLocation(p.name, p.role, p.location_key).split("|")[0]
    )
  );
  console.log(
    `Any of Hilary's actors above threshold publicly? ${
      flagged.length > 0 ? "YES — " + flagged.map(f => f.name).join(", ") : "NO"
    }`
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
