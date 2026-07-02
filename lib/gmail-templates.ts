import { readFile } from "fs/promises";
import path from "path";

const TEMPLATES_DIR = process.env.GMAIL_TEMPLATES_DIR || "/Users/meghannmiller/Code/standwithmeg-show/templates";

export async function renderTemplate(name: string, variables: Record<string, string>): Promise<string> {
  const filePath = path.join(/*turbopackIgnore: true*/ TEMPLATES_DIR, `${name}.md`);
  let content = await readFile(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
  }
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">${markdownToHtml(content)}</body></html>`;
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}
