import { buildFraudPacketPdf } from "@/lib/fraud-packet-pdf";
import { getFraudStateName } from "@/lib/complaint-routing/fraudDoorConfig";

export const runtime = "nodejs";

function sanitizeStateCode(raw: string | null): string {
  const code = (raw || "").trim().toUpperCase().slice(0, 2);
  if (!code) return "";
  const name = getFraudStateName(code);
  return name === "your state" ? "" : code;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stateCode = sanitizeStateCode(searchParams.get("state"));
  const filename = stateCode
    ? `Fraud-Documentation-Packet-${stateCode}.pdf`
    : "Fraud-Documentation-Packet.pdf";

  try {
    const pdf = await buildFraudPacketPdf(stateCode);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("fraud-packet pdf generation failed:", err);
    return Response.json({ error: "Could not generate PDF." }, { status: 500 });
  }
}