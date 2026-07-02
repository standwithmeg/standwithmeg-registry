import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { createSmtpTransport, summarizeEmailError } from "../../../../lib/smtp-email";
import { after } from "next/server";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function formatSubmissionLabel(row: {
  created_at: string | null;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  case_county: string | null;
}) {
  const location = [row.case_county, row.state_of_occurrence || row.outside_us_country]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  const submittedDate = row.created_at
    ? new Date(row.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "date not available";
  return location ? `${location} - submitted ${submittedDate}` : `Submitted ${submittedDate}`;
}

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin ||
    "https://my.standwithmeg.com"
  ).replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const limit = rateLimit(request, { ...rateLimitPresets.email, identifier: email });
    if (limit) return limit;

    const sb = createAdminSupabaseClient();
    const { data: submissions, error } = await sb
      .from("survey_submissions")
      .select("id, first_name, created_at, state_of_occurrence, outside_us_country, case_county")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("POST /api/survey/update-link lookup error:", error.message);
      return Response.json({ error: "Could not request an update link right now." }, { status: 500 });
    }

    if (submissions && submissions.length > 0) {
      const origin = appOrigin(request);
      const lines = submissions.map((row, index) => {
        const url = `${origin}/survey?update_email=${encodeURIComponent(email)}&submission_id=${encodeURIComponent(row.id)}`;
        return [
          `${index + 1}. ${formatSubmissionLabel(row)}`,
          `   ${url}`,
          `   Submission ID: ${row.id}`,
        ].join("\n");
      });

      const firstName = String(submissions[0].first_name || "").trim();
      const greeting = firstName ? `Hi ${firstName},` : "Hi,";
      const bodyText = [
        greeting,
        "",
        "Use the link below to open the update form with your details filled in. You do not need to remember or type the long submission ID.",
        "",
        ...lines,
        "",
        "If you did not request this, you can ignore this email. Your survey was not changed.",
        "",
        "Stand With Meg",
      ].join("\n");

      after(async () => {
        try {
          const { transporter, fromAddress, replyToAddress } = await createSmtpTransport("Survey update link");
          await transporter.sendMail({
            from: `"Stand With Meg" <${fromAddress}>`,
            replyTo: replyToAddress,
            to: email,
            subject: "Your Stand With Meg survey update link",
            text: bodyText,
          });
        } catch (err) {
          console.error("survey update-link email failed:", summarizeEmailError(err));
        }
      });
    }

    return Response.json({
      success: true,
      message: "If that email is in the registry, an update link is on the way.",
    });
  } catch (err) {
    console.error("POST /api/survey/update-link error:", err);
    return Response.json({ error: "Could not request an update link right now." }, { status: 500 });
  }
}
