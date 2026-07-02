import { DONATION_URL, EXPLAINER_VIDEO_URL } from "./site-links";
import { createSmtpTransport } from "./smtp-email";

/**
 * Details needed to send a family their post-submission confirmation email.
 * Sent only for brand-new submissions (POST /api/survey), never for edits.
 */
export type SurveyConfirmationEmailInput = {
  email: string;
  firstName: string;
  submissionId: string;
  /** App origin with no trailing slash, e.g. "https://my.standwithmeg.com". */
  appOrigin: string;
};

/**
 * Email the submitter a thank-you + next-steps message after their survey is
 * registered. Designed to be called fire-and-forget from the request path:
 * any failure is the caller's to swallow so a flaky mail server never blocks
 * a family's submission from being saved.
 *
 * Throws if SMTP is misconfigured or the send fails, so callers should wrap
 * this in `.catch()`.
 */
export async function sendSurveyConfirmationEmail(
  input: SurveyConfirmationEmailInput,
): Promise<{ messageId?: string }> {
  const origin = input.appOrigin.replace(/\/+$/, "");
  const firstName = input.firstName.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const bodyText = [
    greeting,
    "",
    "Thank you for sharing your story with Stand With Meg. Your case has been added to the Family Rights Registry — you are now part of a public record built by families, for families.",
    "",
    "WATCH THIS FIRST",
    "   A short walkthrough of everything you can now see — the registry, the state reports, and the data — and how to put it in front of your state legislators:",
    `   ${EXPLAINER_VIDEO_URL}`,
    "",
    "WHAT HAPPENS NEXT",
    "",
    "1. Check the Court Actor Registry",
    "   Search the judges, GALs, attorneys, evaluators, and caseworkers other families have named. When 3 or more families independently name the same person, that name becomes public.",
    `   ${origin}/actors`,
    "",
    "2. See the movement dashboard and your state report",
    "   Real numbers from real families — the same data you can bring to your state legislators.",
    `   ${origin}/report`,
    "",
    "3. Share the registry with one other family-court parent",
    "   Every person who shares and submits moves the next name closer to public.",
    `   ${origin}/survey`,
    "",
    "4. Help keep the registry public",
    "   The registry, the reports, and the court-actor records stay online, searchable, and free because supporters fund them. If you are able, please consider donating:",
    `   ${DONATION_URL}`,
    "",
    "YOUR SUBMISSION ID",
    `   ${input.submissionId}`,
    "   Save this ID. You can use it to update or request removal of your submission at any time.",
    "",
    `If you need to update your survey later, request your update link at ${origin}/survey.`,
    "",
    "Thank you for having the courage to speak out.",
    "",
    "Meg",
    "StandWithMeg.com",
  ].join("\n");

  const { transporter, fromAddress, replyToAddress } = await createSmtpTransport("Survey confirmation");

  const info = await transporter.sendMail({
    from: `"Stand With Meg" <${fromAddress}>`,
    replyTo: replyToAddress,
    to: input.email,
    subject: "Your Stand With Meg survey is registered — here's what happens next",
    text: bodyText,
  });

  return { messageId: info.messageId };
}
