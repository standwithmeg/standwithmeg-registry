import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGETS = [
  "aaf119d5-0ba6-4c70-a6a6-6bce3ba7f63b",
  "daa2017b-9d70-4c3e-a799-1da1f8b643f0",
  "fe88de15-e87b-4b6d-8ad7-16eb9bad3bc0",
];

async function main() {
  const { data, error } = await sb
    .from("court_actors")
    .update({ name: "Lawrence Army Jr." })
    .in("id", TARGETS)
    .select("id, name, role, court_or_county, state_code");

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`Updated ${data?.length ?? 0} row(s):\n`);
  for (const r of data ?? []) {
    console.log(
      `• "${r.name}"  [${r.role}]  — ${r.court_or_county ?? "(no court)"}  ${r.state_code}  id=${r.id}`
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
