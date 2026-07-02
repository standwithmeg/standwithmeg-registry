import sharp from "sharp";
import fs from "fs";
import path from "path";

const source = path.join(__dirname, "../app/icon.png");
const outDir = path.join(__dirname, "../public/icons");

const NAVY = { r: 10, g: 15, b: 26 };

async function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const base = sharp(source);

  // Standard icons
  await base.clone().resize(192, 192, { fit: "contain", background: NAVY }).toFile(path.join(outDir, "icon-192.png"));
  await base.clone().resize(512, 512, { fit: "contain", background: NAVY }).toFile(path.join(outDir, "icon-512.png"));

  // Maskable icon: content inside the 80% safe zone so platform masks don't clip it
  const maskableSize = 512;
  const safeZone = Math.round(maskableSize * 0.8);
  const resized = await sharp(source).resize(safeZone, safeZone, { fit: "contain", background: NAVY }).toBuffer();
  await sharp({
    create: { width: maskableSize, height: maskableSize, channels: 4, background: NAVY },
  })
    .composite([{ input: resized, gravity: "center" }])
    .toFile(path.join(outDir, "icon-512-maskable.png"));

  console.log("PWA icons generated in public/icons");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
