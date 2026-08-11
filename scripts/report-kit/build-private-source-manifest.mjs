import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const archiveRoot = path.join(process.cwd(), "private-docs", "shawn-report-kit-sources");
const sourceGroups = ["drive-snapshot", "computer-sources", "editorial-synthesis"];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    if (entry.isFile() && entry.name !== ".DS_Store") files.push(fullPath);
  }
  return files;
}

function privacyFor(relativePath) {
  if (relativePath.includes("Survey Info for Shawn")) {
    return "restricted_family_or_registry_data";
  }
  if (relativePath.startsWith("editorial-synthesis/")) {
    return "internal_editorial_working_source";
  }
  return "internal_research_source";
}

const records = [];
for (const group of sourceGroups) {
  const groupRoot = path.join(archiveRoot, group);
  const files = await walk(groupRoot);
  for (const fullPath of files) {
    const buffer = await fs.readFile(fullPath);
    const relativePath = path.relative(archiveRoot, fullPath);
    records.push({
      path: relativePath,
      group,
      extension: path.extname(fullPath).toLowerCase() || "none",
      bytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      privacy: privacyFor(relativePath),
      publication_status: "internal_review_only",
      deploy: false,
    });
  }
}

records.sort((a, b) => a.path.localeCompare(b.path));
const counts = Object.fromEntries(sourceGroups.map(group => [group, records.filter(record => record.group === group).length]));
const manifest = {
  archive: "Shawn Report Kit private source archive",
  generated_at: new Date().toISOString(),
  source_count: records.length,
  counts,
  rules: {
    public_path: false,
    deploy: false,
    family_data: "Never paste into public AI, public routes, or a deployable bundle.",
    source_status: "Archive presence does not verify a claim or authorize publication.",
  },
  files: records,
};

await fs.writeFile(path.join(archiveRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const markdownRows = records.map(record =>
  `| ${record.path.replaceAll("|", "\\|")} | ${record.bytes} | ${record.sha256} | ${record.privacy} |`
);
const markdown = `# Shawn Report Kit private source manifest

Generated: ${manifest.generated_at}

Total source files: ${records.length}

- Drive snapshot: ${counts["drive-snapshot"]}
- Computer-only sources: ${counts["computer-sources"]}
- Editorial synthesis: ${counts["editorial-synthesis"]}

Every file is internal-review-only and marked \`deploy: false\`. Archive presence is not claim verification or publication approval.

| Path | Bytes | SHA-256 | Privacy |
|---|---:|---|---|
${markdownRows.join("\n")}
`;

await fs.writeFile(path.join(archiveRoot, "manifest.md"), markdown);
console.log(JSON.stringify({ sourceCount: records.length, counts }, null, 2));
