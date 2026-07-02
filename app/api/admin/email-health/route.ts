import { createServerSupabaseClient } from "../../../../lib/supabase";
import { isAdminEmail } from "../../../../lib/require-auth";
import { createSmtpTransport, summarizeEmailError } from "../../../../lib/smtp-email";

export const runtime = "nodejs";

function domainOf(value: string): string | null {
  const at = value.lastIndexOf("@");
  return at > -1 ? value.slice(at + 1).toLowerCase() : null;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const {
      transporter,
      host,
      port,
      secure,
      fromAddress,
      replyToAddress,
      smtpUser,
    } = await createSmtpTransport("Admin email health");

    await transporter.verify();

    return Response.json({
      ok: true,
      smtp: {
        host,
        port,
        secure,
        userDomain: domainOf(smtpUser),
        fromDomain: domainOf(fromAddress),
        replyToDomain: domainOf(replyToAddress),
      },
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: summarizeEmailError(err),
    }, { status: 500 });
  }
}
