"use client";

import { useEffect, useState } from "react";
import type { Actor } from "@/fixtures/data";
import { NATIONAL_STATS, STATE_ROWS, money } from "@/fixtures/data";

/**
 * Renders the real Stand With Meg social pack for an actor, matching the
 * production 8-frame design: cover → quote slides (ALL quotes, paginated,
 * best-part excerpts) → state stats → national pattern → "KEEP US QUIET" →
 * Meg host card → CTA end card.
 *
 * Frames are drawn to 1080×1920 canvases and shown as <img> so a long-press
 * on a phone saves straight to Photos; the Download buttons save proper
 * .jpg files (Lastname_ST_frame-01.jpg) on a computer.
 */

const W = 1080;
const H = 1920;
const NAVY = "#0B1A2D";
const NAVY_DEEP = "#050A14";
const GOLD = "#C9A227";
const GOLD_SOFT = "#E0B93C";
const GOLD_DARK = "#8a6d14";
const CRIMSON = "#B91C1C";
const RED = "#D92639";
const FLAG_RED = "#9F1F2C";
const WHITE = "#F5F5F5";
const CREAM = "#F2EAD6";
const W70 = "rgba(245,245,245,0.7)";
const W45 = "rgba(245,245,245,0.45)";
const W30 = "rgba(245,245,245,0.3)";

type Fonts = { anton: string; oswald: string; fraunces: string; inter: string; mono: string };

function cssFont(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "sans-serif";
}

function bg(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, NAVY_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // faint flag stripes for texture (never over faces — fixture uses silhouettes)
  ctx.fillStyle = "rgba(159,31,44,0.10)";
  for (const y of [260, 420, 580]) ctx.fillRect(0, y, W, 64);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function footer(ctx: CanvasRenderingContext2D, f: Fonts) {
  ctx.textAlign = "center";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillStyle = W70;
  ctx.fillText("@STANDWITHMEG   ·   STANDWITHMEG.COM", W / 2, H - 108);
  ctx.font = `400 21px ${f.mono}`;
  ctx.fillStyle = W30;
  ctx.fillText("F A M I L Y - R E P O R T E D   S U B M I S S I O N S .", W / 2, H - 62);
}

function eyebrow(ctx: CanvasRenderingContext2D, f: Fonts, text: string, color = GOLD_SOFT) {
  ctx.textAlign = "left";
  ctx.font = `500 27px ${f.mono}`;
  ctx.fillStyle = color;
  ctx.fillText(text.split("").join("  "), 72, 140);
}

function newChip(ctx: CanvasRenderingContext2D, f: Fonts) {
  ctx.fillStyle = RED;
  const cw = 128;
  roundRect(ctx, W - 72 - cw, 96, cw, 62, 12);
  ctx.fill();
  ctx.font = `700 34px ${f.oswald}`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText("NEW", W - 72 - cw / 2, 139);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** "Best part" of a quote: trim to the strongest ~170 chars on a sentence/word boundary. */
function excerpt(q: string): string {
  if (q.length <= 175) return q;
  const cut = q.slice(0, 172);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return `${cut.slice(0, stop > 90 ? stop : 172).trim()}…`;
}

function silhouette(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.fillStyle = "rgba(245,245,245,0.05)";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "rgba(201,162,39,0.45)";
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, size, size);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(201,162,39,0.28)";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.36, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.92, size * 0.34, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function lockup(ctx: CanvasRenderingContext2D, f: Fonts, first: string, last: string, x: number, y: number, firstSize: number, lastSize: number) {
  ctx.textAlign = "left";
  ctx.font = `400 ${firstSize}px ${f.anton}`;
  ctx.fillStyle = WHITE;
  ctx.fillText(first.toUpperCase(), x, y);
  const ly = y + lastSize * 1.02;
  ctx.font = `400 ${lastSize}px ${f.anton}`;
  ctx.fillStyle = GOLD_DARK;
  ctx.fillText(last.toUpperCase(), x + 9, ly + 9);
  ctx.fillStyle = GOLD;
  ctx.fillText(last.toUpperCase(), x, ly);
  return ly;
}

// ---------------------------------------------------------------- frames

function drawCover(ctx: CanvasRenderingContext2D, f: Fonts, actor: Actor) {
  bg(ctx);
  eyebrow(ctx, f, "COURT ACTOR · PUBLIC RECORD");
  newChip(ctx, f);
  silhouette(ctx, (W - 620) / 2, 260, 620);
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillStyle = W45;
  ctx.textAlign = "center";
  ctx.fillText("PORTRAIT PLACEHOLDER — PREVIEW", W / 2, 940);
  const ly = lockup(ctx, f, actor.firstName, actor.lastName, 72, 1160, 108, 150);
  ctx.font = `italic 400 46px ${f.fraunces}`;
  ctx.fillStyle = W70;
  ctx.textAlign = "left";
  ctx.fillText(actor.role, 72, ly + 84);
  // count band
  ctx.fillStyle = "rgba(185,28,46,0.16)";
  ctx.fillRect(72, ly + 140, W - 144, 150);
  ctx.strokeStyle = "rgba(217,38,57,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(72, ly + 140, W - 144, 150);
  ctx.font = `400 96px ${f.anton}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(String(actor.familyCount), 110, ly + 252);
  ctx.font = `500 30px ${f.mono}`;
  ctx.fillStyle = W70;
  ctx.fillText("FAMILIES REPORTED", 240, ly + 218);
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillStyle = W45;
  ctx.fillText(`${actor.county.toUpperCase()} · ${actor.state.toUpperCase()}`, 240, ly + 258);
  footer(ctx, f);
}

function drawQuotes(ctx: CanvasRenderingContext2D, f: Fonts, quotes: string[], page: number, pages: number) {
  bg(ctx);
  eyebrow(ctx, f, "IN FAMILIES' OWN WORDS");
  if (pages > 1) {
    ctx.font = `500 30px ${f.mono}`;
    ctx.fillStyle = W45;
    ctx.textAlign = "right";
    ctx.fillText(`${page}/${pages}`, W - 72, 140);
  }
  ctx.textAlign = "left";
  ctx.font = `400 92px ${f.anton}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("WHAT FAMILIES", 72, 320);
  ctx.fillStyle = GOLD;
  ctx.fillText("SAY", 72, 424);
  let y = 580;
  for (const q of quotes) {
    ctx.font = `italic 400 46px ${f.fraunces}`;
    const lines = wrap(ctx, `“${excerpt(q)}”`, W - 260);
    ctx.fillStyle = RED;
    ctx.fillRect(84, y - 44, 6, lines.length * 62 + 20);
    ctx.fillStyle = CREAM;
    for (const line of lines) {
      ctx.fillText(line, 130, y);
      y += 62;
    }
    ctx.font = `500 26px ${f.mono}`;
    ctx.fillStyle = W45;
    ctx.fillText("— A FAMILY'S REPORT", 130, y + 14);
    y += 130;
  }
  footer(ctx, f);
}

function drawStateStats(ctx: CanvasRenderingContext2D, f: Fonts, actor: Actor) {
  const row = STATE_ROWS.find((s) => s.abbr === actor.stateAbbr);
  bg(ctx);
  eyebrow(ctx, f, `${actor.state.toUpperCase()} · LIVE STATS`, GOLD_SOFT);
  ctx.textAlign = "left";
  ctx.font = `400 86px ${f.anton}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("WHAT THE", 72, 340);
  ctx.fillStyle = GOLD;
  ctx.fillText("SYSTEM", 72, 440);
  ctx.fillStyle = WHITE;
  ctx.fillText("IS DOING TO", 72, 540);
  ctx.fillText("OUR FAMILIES", 72, 640);
  const stats: [string, string][] = [
    [String(row?.families ?? "—"), "FAMILIES REPORTING"],
    [row ? money(row.reportedLosses) : "—", "REPORTED LOSSES"],
    [String(row?.publicActors ?? "—"), "COURT ACTORS ON THE PUBLIC RECORD"],
  ];
  let y = 840;
  for (const [num, label] of stats) {
    ctx.font = `400 130px ${f.anton}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(num, 72, y);
    ctx.font = `500 30px ${f.mono}`;
    ctx.fillStyle = W70;
    ctx.fillText(label, 72, y + 52);
    y += 260;
  }
  footer(ctx, f);
}

function drawNational(ctx: CanvasRenderingContext2D, f: Fonts) {
  bg(ctx);
  eyebrow(ctx, f, "A GLOBAL PATTERN", GOLD_SOFT);
  ctx.textAlign = "center";
  ctx.font = `400 330px ${f.anton}`;
  ctx.fillStyle = GOLD_DARK;
  ctx.fillText(String(NATIONAL_STATS.families), W / 2 + 12, 772);
  ctx.fillStyle = GOLD;
  ctx.fillText(String(NATIONAL_STATS.families), W / 2, 760);
  ctx.font = `700 76px ${f.oswald}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("FAMILIES AND COUNTING", W / 2, 900);
  ctx.font = `500 34px ${f.mono}`;
  ctx.fillStyle = W45;
  ctx.fillText(`${NATIONAL_STATS.states} STATES  ·  ${NATIONAL_STATS.countries} COUNTRIES  ·  ONE PATTERN`, W / 2, 972);
  ctx.font = `700 58px ${f.oswald}`;
  ctx.fillStyle = W70;
  const claim = "NOT AN ISOLATED INCIDENT.";
  ctx.fillText(claim, W / 2, 1120);
  // crimson strike through the system's claim (never a name)
  const cw = ctx.measureText("ISOLATED INCIDENT.").width;
  const start = W / 2 + ctx.measureText(claim).width / 2 - cw;
  ctx.strokeStyle = CRIMSON;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(start - 8, 1102);
  ctx.lineTo(start + cw + 8, 1090);
  ctx.stroke();
  ctx.font = `400 150px ${f.anton}`;
  ctx.fillStyle = GOLD;
  ctx.fillText("A PATTERN.", W / 2, 1310);
  footer(ctx, f);
}

function drawQuiet(ctx: CanvasRenderingContext2D, f: Fonts) {
  // Big type FILLS the slide — the fix for the old frame 7.
  bg(ctx);
  ctx.textAlign = "left";
  const lines: [string, string][] = [
    ["THEY", WHITE],
    ["THOUGHT", WHITE],
    ["THEY", WHITE],
    ["COULD", WHITE],
    ["KEEP US", WHITE],
    ["QUIET.", GOLD],
  ];
  let y = 350;
  for (const [word, color] of lines) {
    ctx.font = `400 236px ${f.anton}`;
    ctx.fillStyle = color;
    ctx.fillText(word, 72, y);
    if (word === "QUIET.") {
      const qw = ctx.measureText(word).width;
      ctx.strokeStyle = CRIMSON;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(64, y - 78);
      ctx.lineTo(88 + qw, y - 96);
      ctx.stroke();
    }
    y += 232;
  }
  ctx.font = `700 52px ${f.oswald}`;
  ctx.fillStyle = RED;
  ctx.fillText("NOT ANY MORE.", 72, y + 8);
  footer(ctx, f);
}

function drawMeg(ctx: CanvasRenderingContext2D, f: Fonts, megImg: HTMLImageElement | null) {
  bg(ctx);
  if (megImg) {
    // cover-fit the CLEAN upper portion of the photo (the source hero has
    // baked-in text in its lower half) into the top ~62%; face stays clean
    const areaH = Math.round(H * 0.62);
    const srcH = megImg.height * 0.55;
    const scale = Math.max(W / megImg.width, areaH / srcH);
    const dw = megImg.width * scale;
    const dh = srcH * scale;
    ctx.drawImage(megImg, 0, 0, megImg.width, srcH, (W - dw) / 2, 0, dw, dh);
    const fade = ctx.createLinearGradient(0, areaH - 320, 0, areaH + 10);
    fade.addColorStop(0, "rgba(5,10,20,0)");
    fade.addColorStop(1, NAVY_DEEP);
    ctx.fillStyle = fade;
    ctx.fillRect(0, areaH - 320, W, 340);
  }
  eyebrow(ctx, f, "INVESTIGATIVE JOURNALIST", GOLD_SOFT);
  const y = Math.round(H * 0.62) + 150;
  ctx.textAlign = "left";
  ctx.font = `400 190px ${f.anton}`;
  ctx.fillStyle = GOLD_DARK;
  ctx.fillText("MEG", 81, y + 9);
  ctx.fillStyle = GOLD;
  ctx.fillText("MEG", 72, y);
  ctx.font = `italic 400 48px ${f.fraunces}`;
  ctx.fillStyle = W70;
  ctx.fillText("Documenting the public record,", 72, y + 100);
  ctx.fillText("one family at a time.", 72, y + 164);
  footer(ctx, f);
}

function drawCTA(ctx: CanvasRenderingContext2D, f: Fonts) {
  bg(ctx);
  ctx.textAlign = "center";
  ctx.font = `400 170px ${f.anton}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("STAND", W / 2, 640);
  ctx.fillText("WITH", W / 2, 810);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillText("MEG.", W / 2 + 10, 990);
  ctx.fillStyle = GOLD;
  ctx.fillText("MEG.", W / 2, 980);
  ctx.font = `700 44px ${f.oswald}`;
  ctx.fillStyle = W70;
  ctx.fillText("YOUR STORY IS A DATA POINT.", W / 2, 1140);
  // cream CTA pill with red dot
  const pw = 760;
  ctx.fillStyle = CREAM;
  roundRect(ctx, (W - pw) / 2, 1240, pw, 118, 59);
  ctx.fill();
  ctx.fillStyle = "#EF4444";
  ctx.beginPath();
  ctx.arc((W - pw) / 2 + 74, 1299, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 44px ${f.oswald}`;
  ctx.fillStyle = NAVY;
  ctx.fillText("STANDWITHMEG.COM/SURVEY ↗", W / 2 + 24, 1315);
  footer(ctx, f);
}

// ---------------------------------------------------------------- component

interface Frame {
  label: string;
  dataUrl: string;
  filename: string;
}

export function ActorSlideDeck({ actor }: { actor: Actor }) {
  const [frames, setFrames] = useState<Frame[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await document.fonts.ready;
      const f: Fonts = {
        anton: cssFont("--font-anton"),
        oswald: cssFont("--font-oswald"),
        fraunces: cssFont("--font-fraunces"),
        inter: cssFont("--font-inter"),
        mono: cssFont("--font-mono"),
      };
      // force-load weights canvas needs
      await Promise.all(
        ["400 100px", "700 60px", "italic 400 46px", "500 28px"].map((spec) =>
          Promise.all([
            document.fonts.load(`${spec.includes("italic") ? spec : spec} ${f.fraunces}`),
            document.fonts.load(`400 100px ${f.anton}`),
            document.fonts.load(`700 60px ${f.oswald}`),
            document.fonts.load(`500 28px ${f.mono}`),
          ]),
        ),
      );
      const megImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "/meg/meg-hero.jpg";
      });

      // Paginate ALL quotes — 2 per slide, more slides when there are more quotes.
      const chunks: string[][] = [];
      for (let i = 0; i < actor.quotes.length; i += 2) chunks.push(actor.quotes.slice(i, i + 2));

      const painters: { label: string; draw: (ctx: CanvasRenderingContext2D) => void }[] = [
        { label: "Cover", draw: (ctx) => drawCover(ctx, f, actor) },
        ...chunks.map((chunk, i) => ({
          label: chunks.length > 1 ? `Family quotes ${i + 1}/${chunks.length}` : "Family quotes",
          draw: (ctx: CanvasRenderingContext2D) => drawQuotes(ctx, f, chunk, i + 1, chunks.length),
        })),
        { label: `${actor.state} stats`, draw: (ctx) => drawStateStats(ctx, f, actor) },
        { label: "Global pattern", draw: (ctx) => drawNational(ctx, f) },
        { label: "Keep us quiet", draw: (ctx) => drawQuiet(ctx, f) },
        { label: "Meg host card", draw: (ctx) => drawMeg(ctx, f, megImg) },
        { label: "Follow + survey", draw: (ctx) => drawCTA(ctx, f) },
      ];

      const rendered: Frame[] = painters.map((p, i) => {
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;
        p.draw(ctx);
        const n = String(i + 1).padStart(2, "0");
        return {
          label: p.label,
          dataUrl: canvas.toDataURL("image/jpeg", 0.92),
          filename: `${actor.lastName.replace(/\s+/g, "_")}_${actor.stateAbbr}_frame-${n}.jpg`,
        };
      });
      if (alive) setFrames(rendered);
    })();
    return () => {
      alive = false;
    };
  }, [actor]);

  const downloadAll = () => {
    frames.forEach((fr, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = fr.dataUrl;
        a.download = fr.filename;
        a.click();
      }, i * 350);
    });
  };

  if (frames.length === 0) {
    return <p className="disclaimer-strip">Rendering slides…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <p className="text-sm" style={{ color: "var(--ink-70)" }}>
          {frames.length} frames · On a phone: press and hold any slide → <strong>Save Image</strong>.
          On a computer: use the download buttons.
        </p>
        <button className="action-pill" onClick={downloadAll}>Download all {frames.length} slides ↓</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {frames.map((fr, i) => (
          <figure key={fr.filename} className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fr.dataUrl} alt={`Slide ${i + 1}: ${fr.label}`} className="w-full" style={{ border: "1px solid var(--hairline)" }} />
            <figcaption className="mt-2 flex items-center justify-between gap-2">
              <span className="disclaimer-strip">{String(i + 1).padStart(2, "0")} · {fr.label}</span>
              <a href={fr.dataUrl} download={fr.filename} className="nav-link text-xs whitespace-nowrap">↓ Save</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
