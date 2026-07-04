"use client";

import { useState } from "react";
import VIDEOS from "@/fixtures/video-links.json";

type PageKey = keyof typeof VIDEOS;

/**
 * The standwithmeg.com video-card pattern: 16:9 thumb, play overlay,
 * show-brand badge top-left, mono caption underneath. Real URLs get
 * swapped into fixtures/video-links.json later — no code changes needed.
 */
export function VideoWalkthroughCard({ page, maxWidth = 520, variant }: { page: PageKey; maxWidth?: number; variant?: "wide" }) {
  const v = VIDEOS[page];
  const [open, setOpen] = useState(false);

  if (variant === "wide" && !open) {
    return (
      <figure className="panel panel--raised grid md:grid-cols-[1fr_1.4fr] overflow-hidden m-0" style={{ borderColor: "var(--hairline-gold)" }}>
        <div className="p-8 flex flex-col justify-center items-start gap-3">
          <span className="badge badge--gold">Stand With Meg guide</span>
          <h3 className="display text-2xl md:text-3xl" style={{ color: "var(--ink)" }}>{v.title.toUpperCase()}</h3>
          <hr className="rule-red" style={{ margin: "0.2rem 0 0.6rem" }} />
          <p className="eyebrow eyebrow--gold">Watch · Coming soon</p>
          <button className="gold-pill mt-2" style={{ padding: "0.55rem 1.3rem", fontSize: "0.8rem" }} onClick={() => setOpen(true)}>
            Coming soon
          </button>
        </div>
        <button className="video-thumb block border-0 p-0 cursor-pointer" onClick={() => setOpen(true)} aria-label={`Play video: ${v.title}`} style={{ minHeight: 260 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumb} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <span className="video-play" aria-hidden><span>▶</span></span>
        </button>
      </figure>
    );
  }

  return (
    <figure style={{ maxWidth: variant === "wide" ? undefined : maxWidth, margin: 0 }}>
      {open ? (
        <div className="video-card" style={{ cursor: "default" }}>
          <div className="video-thumb" style={{ display: "grid", placeItems: "center" }}>
            {v.url ? (
              <video src={v.url} controls autoPlay style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="text-center px-8">
                <p className="eyebrow eyebrow--gold mb-3">Coming soon</p>
                <p className="text-sm" style={{ color: "var(--white)", opacity: 0.8 }}>
                  Meg is recording a fresh walkthrough for the new site — it drops right here.
                </p>
                <button className="btn-quiet mt-4" onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button className="video-card" onClick={() => setOpen(true)} aria-label={`Play video: ${v.title}`}>
          <span className="video-thumb block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.thumb} alt="" loading="lazy" />
            <span className="video-badge">
              <b>STAND WITH MEG</b> {v.badge}
            </span>
            <span className="video-badge" style={{ top: "auto", bottom: "0.8rem", left: "0.8rem", background: "rgba(201,162,39,0.92)", color: "#0B1A2D", border: "none" }}>
              <b style={{ color: "#0B1A2D" }}>COMING SOON</b>
            </span>
            <span className="video-play" aria-hidden>
              <span>▶</span>
            </span>
          </span>
          <span className="video-caption block">
            <span className="headline text-sm block mb-1" style={{ color: "var(--ink)" }}>{v.title}</span>
            <span className="eyebrow eyebrow--gold">WATCH · COMING SOON</span>
          </span>
        </button>
      )}
    </figure>
  );
}
