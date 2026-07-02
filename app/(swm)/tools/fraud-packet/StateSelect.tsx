"use client";

import { useRouter } from "next/navigation";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

// States with the most established routing first; the full list still works,
// these are just the ones surfaced for quick selection.
const STATES: { code: string; name: string }[] = [
  { code: "", name: "Select your state…" },
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

interface StateSelectProps {
  selected: string;
}

export function StateSelect({ selected }: StateSelectProps) {
  const router = useRouter();

  return (
    <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-wide" style={{ color: GOLD }}>
      Your state
      <select
        value={selected}
        onChange={event => {
          const code = event.target.value;
          router.push(code ? `/tools/fraud-packet?state=${code}` : "/tools/fraud-packet");
        }}
        className="rounded-md border px-3 py-2 text-sm font-semibold"
        style={{ borderColor: "rgba(201,162,39,0.45)", color: "white", backgroundColor: NAVY }}
      >
        {STATES.map(state => (
          <option key={state.code || "none"} value={state.code} style={{ color: "black" }}>
            {state.name}
          </option>
        ))}
      </select>
    </label>
  );
}
