const GOLD = "#c9a227";

type Role = {
  name: string;
  tagline: string;
  pay: string;
  payNote: string;
  popular?: boolean;
};

const ROLES: Role[] = [
  {
    name: "Referral Partner",
    tagline: "Send us warm leads.",
    pay: "10%",
    payNote: "recurring on every sponsor you refer",
  },
  {
    name: "Sales Partner",
    tagline: "Sell and manage your own book.",
    pay: "20%",
    payNote: "recurring + 10% fast-start on the first payment",
    popular: true,
  },
  {
    name: "Regional Lead",
    tagline: "Build and lead a team.",
    pay: "20%",
    payNote: "personal + 5% on your team's sales",
  },
];

/** Three commission role cards. Sales Partner is the recommended default. */
export function RoleCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {ROLES.map((r) => (
        <div
          key={r.name}
          className="relative rounded-2xl bg-white p-6 text-[#0c1d33] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.6)] transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          style={r.popular ? { outline: `2px solid ${GOLD}`, outlineOffset: "-2px" } : undefined}
        >
          {r.popular && (
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0c1d33]"
              style={{ background: GOLD }}
            >
              Most Popular
            </span>
          )}
          <h3 className="text-base font-black">{r.name}</h3>
          <p className="mt-1 text-[13px] italic text-[#5b6675]">{r.tagline}</p>
          <div className="mt-4 text-4xl font-black" style={{ color: "#a8821a" }}>
            {r.pay}
          </div>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-[#3a4757]">{r.payNote}</p>
        </div>
      ))}
    </div>
  );
}
