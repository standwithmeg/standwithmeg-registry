import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

const KNOWLEDGE_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "content", "shawn-lee");

export function loadShawnLeeKnowledge(): string {
  const files = ["fraud-education-core.md"];
  const parts: string[] = [];
  for (const file of files) {
    try {
      parts.push(readFileSync(join(/*turbopackIgnore: true*/ KNOWLEDGE_DIR, file), "utf-8").slice(0, 6000));
    } catch {
      // optional file
    }
  }
  return parts.join("\n\n");
}