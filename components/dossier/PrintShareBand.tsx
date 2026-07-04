/**
 * The courthouse print kit — real assets, real downloads.
 * Poster for bulletin boards + wide banner for posts/emails,
 * both carrying scannable QR codes to the survey and the report.
 */
const ITEMS = [
  {
    file: "/meg/know-your-court-actors_POSTER_final.png",
    download: "StandWithMeg_Town_Poster.png",
    title: "Town Poster",
    desc: "Print & hang it — courthouses, libraries, coffee shops. QR codes link to the survey and the report.",
    aspect: "3/4",
  },
  {
    file: "/meg/know-your-court-actors_BANNER.png",
    download: "StandWithMeg_Wide_Banner.png",
    title: "Wide Banner",
    desc: "For posts, emails, and sharing online. Same scannable QR codes.",
    aspect: "2/1",
  },
];

export function PrintShareBand() {
  return (
    <aside className="panel p-7" aria-label="Print and share kit">
      <p className="eyebrow eyebrow--gold mb-2">Help spread the word</p>
      <h2 className="headline text-lg mb-2">Print &amp; share these</h2>
      <p className="text-sm mb-7 max-w-xl" style={{ color: "var(--ink-70)" }}>
        Free to download. Hang them at your courthouse or share them online —
        every scan brings another family to the survey.
      </p>
      <div className="grid sm:grid-cols-2 gap-6">
        {ITEMS.map((item) => (
          <figure key={item.title} className="m-0 flex flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.file}
              alt={`${item.title} — Know Your Court Actors`}
              loading="lazy"
              className="w-full object-contain"
              style={{ border: "1px solid var(--hairline)", background: "var(--navy-deep)", maxHeight: "340px" }}
            />
            <figcaption className="mt-3 mb-4">
              <span className="headline text-base block">{item.title}</span>
              <span className="text-sm block mt-1" style={{ color: "var(--ink-70)" }}>{item.desc}</span>
            </figcaption>
            <a href={item.file} download={item.download} className="gold-pill justify-center mt-auto">
              ⤓ Download {item.title}
            </a>
          </figure>
        ))}
      </div>
    </aside>
  );
}
