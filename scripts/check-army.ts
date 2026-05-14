import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await sb
    .from("court_actors")
    .select(
      "id, role, name, court_or_county, state_code, source, created_at, submission_id"
    )
    .eq("state_code", "MA")
    .ilike("name", "%army%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`MA actors with "army" in name: ${data?.length ?? 0}\n`);
  for (const a of data ?? []) {
    console.log(
      `• "${a.name}"  [${a.role}]  — ${a.court_or_county ?? "(no court)"}  source=${a.source}  id=${a.id}  sub=${a.submission_id}  ${a.created_at}`
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
