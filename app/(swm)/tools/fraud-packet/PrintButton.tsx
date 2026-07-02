"use client";

const GOLD = "#C9A227";

type PrintButtonProps = {
  stateCode: string;
};

export function PrintButton({ stateCode }: PrintButtonProps) {
  const href = stateCode
    ? `/api/fraud-packet/pdf?state=${encodeURIComponent(stateCode)}&v=3`
    : "/api/fraud-packet/pdf?v=3";

  return (
    <a
      href={href}
      download
      className="rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide"
      style={{ borderColor: "rgba(201,162,39,0.45)", color: GOLD }}
    >
      Download PDF Packet
    </a>
  );
}