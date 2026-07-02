"use client";

const GOLD = "#C9A227";
const BG = "#0F1E30";

interface PrintKitItem {
  title: string;
  description: string;
  src: string;
  downloadName: string;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
}

// Files live in /public/print-kit/finished and are served from the site root.
const PRINT_KIT: readonly PrintKitItem[] = [
  {
    title: "Town Poster",
    description: "Print & hang it. QR codes link to the survey and the report.",
    src: "/print-kit/finished/know-your-court-actors_POSTER_final.webp",
    downloadName: "stand-with-meg-poster.webp",
    width: 1086,
    height: 1448,
    orientation: "portrait",
  },
  {
    title: "Wide Banner",
    description: "For posts, emails, and sharing online. Same scannable QR codes.",
    src: "/print-kit/finished/know-your-court-actors_BANNER.webp",
    downloadName: "stand-with-meg-banner.webp",
    width: 1731,
    height: 909,
    orientation: "landscape",
  },
];

export function PrintKitBand() {
  return (
    <section
      aria-labelledby="print-kit-heading"
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid rgba(201,162,39,0.25)` }}
    >
      <div
        className="px-6 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(30,58,95,0.4)" }}
      >
        <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>
          Help spread the word
        </p>
        <h2 id="print-kit-heading" className="font-black text-white text-base tracking-wide">
          Print &amp; Share These
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(245,245,245,0.45)" }}>
          Free to download. Hang them in your town or share them online &mdash; every scan brings
          another family to the survey.
        </p>
      </div>

      <div className="grid gap-px sm:grid-cols-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
        {PRINT_KIT.map(item => (
          <div key={item.src} className="flex flex-col p-5 gap-4" style={{ backgroundColor: BG }}>
            <div
              className={`mx-auto w-full overflow-hidden rounded-xl ${
                item.orientation === "portrait" ? "max-w-[220px]" : "max-w-full"
              }`}
              style={{ border: "1px solid rgba(201,162,39,0.25)" }}
            >
              <img
                src={item.src}
                alt={`Stand With Meg ${item.title} — Know Your Court Actors flyer with QR codes to the survey and report`}
                width={item.width}
                height={item.height}
                loading="lazy"
                decoding="async"
                className="w-full h-auto block"
              />
            </div>

            <div className="flex-1 text-center">
              <h3 className="font-black text-white text-sm">{item.title}</h3>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(245,245,245,0.55)" }}>
                {item.description}
              </p>
            </div>

            <a
              href={item.src}
              target="_blank"
              rel="noopener noreferrer"
              download={item.downloadName}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: GOLD, color: BG }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download {item.title}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
