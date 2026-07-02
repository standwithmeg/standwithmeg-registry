import { existsSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  NATIONAL_FRAUD_ENFORCEMENT_CONTACT,
  factsVsConclusionsLine,
  falseStatementCard,
  fraudChecklistItems,
  fraudDocumentationGuidance,
  fraudDocumentationTemplate,
  fraudReportingResources,
  getFraudDoorsForState,
  getFraudStateName,
  whichDoorTree,
  wireFraudElements,
} from "@/lib/complaint-routing/fraudDoorConfig";
import { REPORT_KIT_PRICE_CENTS } from "@/lib/report-kit-constants";

const MARGIN = 54;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 52;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;
const BODY_SIZE = 10.5;
const BODY_LINE_GAP = 5;

const NAVY = "#0F1E30";
const GOLD = "#C9A227";
const CRIMSON = "#9B2C2C";
const BODY = "#1F2937";
const MUTED = "#4B5563";
const CREAM = "#FBF8EF";

const FOOTER_DISCLAIMER =
  "Stand With Meg does not provide legal advice and does not file complaints for families. Educational tool only. Reviewed for educational accuracy by Shawn Lee, Criminal Trial Attorney. No attorney-client relationship. Consult a licensed attorney in your state before filing.";

function resolveHeroImagePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/swm/hero-main-page-meg-shawn.jpg"),
    path.join(process.cwd(), "public/swm/hero-main-page-meg-shawn.png"),
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

function statusLabel(status: string) {
  if (status === "verified") return "Verified routing";
  if (status === "unavailable") return "Unavailable";
  return "Confirm before filing";
}

function ensureSpace(doc: PDFKit.PDFDocument, minHeight: number) {
  if (doc.y + minHeight > CONTENT_BOTTOM) {
    doc.addPage();
  }
}

function gap(doc: PDFKit.PDFDocument, points = 8) {
  doc.y += points;
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 40);
  gap(doc, 10);
  const y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(NAVY)
    .text(text.toUpperCase(), MARGIN, y, { width: CONTENT_WIDTH, characterSpacing: 0.6 });
  const ruleY = doc.y + 4;
  doc
    .moveTo(MARGIN, ruleY)
    .lineTo(MARGIN + CONTENT_WIDTH, ruleY)
    .strokeColor(GOLD)
    .lineWidth(1.75)
    .stroke();
  doc.y = ruleY + 12;
}

function bodyText(doc: PDFKit.PDFDocument, text: string, opts?: { bold?: boolean; size?: number; color?: string }) {
  ensureSpace(doc, 24);
  doc
    .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.size ?? BODY_SIZE)
    .fillColor(opts?.color ?? BODY)
    .text(text, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      lineGap: BODY_LINE_GAP,
      paragraphGap: 4,
    });
  gap(doc, 6);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  items.forEach((item, i) => {
    ensureSpace(doc, 22);
    doc
      .font("Helvetica")
      .fontSize(BODY_SIZE)
      .fillColor(BODY)
      .text(`${i + 1}. ${item}`, MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: BODY_LINE_GAP,
        paragraphGap: 4,
        indent: 14,
      });
    gap(doc, 4);
  });
}

function warningBox(doc: PDFKit.PDFDocument, title: string, body: string) {
  ensureSpace(doc, 72);
  const pad = 12;
  const innerWidth = CONTENT_WIDTH - pad * 2;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(CRIMSON);
  const titleHeight = doc.heightOfString(title, { width: innerWidth, lineGap: 3 });

  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(BODY);
  const bodyHeight = doc.heightOfString(body, { width: innerWidth, lineGap: BODY_LINE_GAP, paragraphGap: 4 });

  const boxHeight = pad + titleHeight + 6 + bodyHeight + pad;

  if (startY + boxHeight > CONTENT_BOTTOM) {
    doc.addPage();
    warningBox(doc, title, body);
    return;
  }

  doc
    .rect(MARGIN, startY, CONTENT_WIDTH, 4)
    .fill(CRIMSON);
  doc
    .rect(MARGIN, startY + 4, CONTENT_WIDTH, boxHeight - 4)
    .fill(CREAM);
  doc
    .rect(MARGIN, startY + 4, CONTENT_WIDTH, boxHeight - 4)
    .strokeColor(CRIMSON)
    .lineWidth(0.75)
    .stroke();

  let y = startY + pad;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(CRIMSON).text(title, MARGIN + pad, y, {
    width: innerWidth,
    lineGap: 3,
  });
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(BODY).text(body, MARGIN + pad, y, {
    width: innerWidth,
    lineGap: BODY_LINE_GAP,
    paragraphGap: 4,
  });
  doc.y = startY + boxHeight + 8;
}

function doorCard(
  doc: PDFKit.PDFDocument,
  name: string,
  status: string,
  whenToUse: string,
  description: string,
  url: string
) {
  const pad = 10;
  const innerWidth = CONTENT_WIDTH - pad * 2;

  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY);
  const nameLine = `${name}  [${status}]`;
  const nameHeight = doc.heightOfString(nameLine, { width: innerWidth });

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(BODY);
  const whenHeight = doc.heightOfString(`Use when: ${whenToUse}`, { width: innerWidth, lineGap: BODY_LINE_GAP });

  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(BODY);
  const descHeight = doc.heightOfString(description, { width: innerWidth, lineGap: BODY_LINE_GAP });

  doc.font("Helvetica").fontSize(9).fillColor("#1D4ED8");
  const urlHeight = doc.heightOfString(`File here: ${url}`, { width: innerWidth, lineGap: 3 });

  const boxHeight = pad + nameHeight + 4 + whenHeight + 4 + descHeight + 4 + urlHeight + pad;

  ensureSpace(doc, boxHeight + 8);
  const startY = doc.y;

  if (startY + boxHeight > CONTENT_BOTTOM) {
    doc.addPage();
    doorCard(doc, name, status, whenToUse, description, url);
    return;
  }

  doc
    .rect(MARGIN, startY, CONTENT_WIDTH, boxHeight)
    .strokeColor("#D1D5DB")
    .lineWidth(0.75)
    .stroke();

  let y = startY + pad;
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(NAVY)
    .text(name, MARGIN + pad, y, { continued: true, width: innerWidth })
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(`  [${status}]`, { width: innerWidth });
  y = doc.y + 4;

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(BODY)
    .text("Use when:", MARGIN + pad, y, { continued: true })
    .font("Helvetica")
    .text(` ${whenToUse}`, { width: innerWidth, lineGap: BODY_LINE_GAP });
  y = doc.y + 4;

  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(BODY).text(description, MARGIN + pad, y, {
    width: innerWidth,
    lineGap: BODY_LINE_GAP,
  });
  y = doc.y + 4;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#1D4ED8")
    .text(`File here: ${url}`, MARGIN + pad, y, { width: innerWidth, lineGap: 3 });

  doc.y = startY + boxHeight + 10;
}

function templateBlock(doc: PDFKit.PDFDocument, template: string) {
  const pad = 12;
  const innerWidth = CONTENT_WIDTH - pad * 2;
  const maxBoxHeight = CONTENT_BOTTOM - MARGIN - 16;

  doc.font("Helvetica").fontSize(9.5).fillColor(BODY);
  const textHeight = doc.heightOfString(template, {
    width: innerWidth,
    lineGap: 4,
    paragraphGap: 6,
  });
  const boxHeight = pad + textHeight + pad;

  if (boxHeight <= maxBoxHeight) {
    ensureSpace(doc, boxHeight + 8);
    const startY = doc.y;
    if (startY + boxHeight <= CONTENT_BOTTOM) {
      doc
        .rect(MARGIN, startY, CONTENT_WIDTH, boxHeight)
        .fillAndStroke("#FAFAFA", "#D1D5DB");
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(BODY)
        .text(template, MARGIN + pad, startY + pad, {
          width: innerWidth,
          lineGap: 4,
          paragraphGap: 6,
        });
      doc.y = startY + boxHeight + 10;
      return;
    }
    doc.addPage();
  }

  ensureSpace(doc, 24);
  const startY = doc.y;
  doc
    .moveTo(MARGIN, startY)
    .lineTo(MARGIN, Math.min(startY + 24, CONTENT_BOTTOM))
    .strokeColor(GOLD)
    .lineWidth(2)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(BODY)
    .text(template, MARGIN + pad, startY, {
      width: innerWidth,
      lineGap: 4,
      paragraphGap: 6,
    });
  gap(doc, 10);
}

function drawCover(doc: PDFKit.PDFDocument, stateName: string, hasState: boolean, generated: string) {
  const coverTop = MARGIN;
  let y = coverTop + 16;

  const heroImage = resolveHeroImagePath();
  if (heroImage) {
    const imageWidth = CONTENT_WIDTH - 24;
    const imageHeight = 118;
    doc.image(heroImage, MARGIN + 12, y, {
      fit: [imageWidth, imageHeight],
      align: "center",
      valign: "center",
    });
    y += imageHeight + 14;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(CRIMSON)
    .text("STAND WITH MEG · THE SHAWN LEE REPORT · FREE DOWNLOAD", MARGIN + 12, y, {
      width: CONTENT_WIDTH - 24,
      characterSpacing: 0.5,
    });
  y = doc.y + 10;

  doc.font("Helvetica-Bold").fontSize(24).fillColor(NAVY).text("Fraud Documentation Packet", MARGIN + 12, y, {
    width: CONTENT_WIDTH - 24,
    lineGap: 2,
  });
  y = doc.y + 8;

  doc
    .font("Helvetica")
    .fontSize(11.5)
    .fillColor(MUTED)
    .text("Build a careful, truthful record of your own case — then take it to the right office.", MARGIN + 12, y, {
      width: CONTENT_WIDTH - 24,
      lineGap: 4,
    });
  y = doc.y + 12;

  const pillText = hasState ? `Prepared for: ${stateName}` : "Select your state online to customize this packet";
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(NAVY)
    .text(pillText, MARGIN + 22, y + 6, { width: CONTENT_WIDTH - 44, characterSpacing: 0.4 });
  y += 34;

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(`Generated ${generated} · Family-reported · General legal education only — not legal advice`, MARGIN + 12, y, {
      width: CONTENT_WIDTH - 24,
      lineGap: 3,
    });

  const coverBottom = doc.y + 16;
  doc
    .rect(MARGIN, coverTop, CONTENT_WIDTH, coverBottom - coverTop)
    .strokeColor(NAVY)
    .lineWidth(2)
    .stroke();

  doc.y = coverBottom + 8;
}

function addPageFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = range.start; i < range.start + totalPages; i++) {
    doc.switchToPage(i);
    const footerTop = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 6;

    doc
      .moveTo(MARGIN, footerTop - 4)
      .lineTo(PAGE_WIDTH - MARGIN, footerTop - 4)
      .strokeColor(GOLD)
      .lineWidth(0.75)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(MUTED)
      .text(FOOTER_DISCLAIMER, MARGIN, footerTop, {
        width: CONTENT_WIDTH,
        lineGap: 2,
        align: "left",
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(NAVY)
      .text(`Page ${i - range.start + 1} of ${totalPages}`, MARGIN, PAGE_HEIGHT - MARGIN - 10, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
}

export async function buildFraudPacketPdf(stateCode: string): Promise<Buffer> {
  const code = stateCode.trim().toUpperCase();
  const stateName = getFraudStateName(code);
  const hasState = stateName !== "your state";
  const doors = getFraudDoorsForState(code);
  const primaryDoor = doors[0];
  const template = fraudDocumentationTemplate(primaryDoor.name, code);
  const kitPrice = `$${(REPORT_KIT_PRICE_CENTS / 100).toFixed(0)}`;
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawCover(doc, hasState ? `${stateName} (${code})` : stateName, hasState, generated);

    heading(doc, "How to use this packet");
    bulletList(doc, [
      'Read "Which door?" below — route by whose money was touched, not by who you blame.',
      "Gather documents first — dates, invoices, emails, e-filings, billing records, messages.",
      "Fill in the copy-ready template using only facts you personally know.",
      "File through the correct portal — URLs and contacts are listed in this PDF.",
      "Keep a copy of everything you submit.",
    ]);

    if (!hasState) {
      warningBox(
        doc,
        "No state selected.",
        "Open https://my.standwithmeg.com/tools/fraud-packet, choose your state, then download again so your State Attorney General door is customized."
      );
    }

    warningBox(
      doc,
      "Before you file anything",
      "Do not copy another family's allegations. Do not exaggerate. Knowingly false statements to federal investigators are a separate federal crime (18 U.S.C. §1001). File only what you personally know and can support with documents."
    );

    heading(doc, "Which door? — quick routing guide");
    whichDoorTree.forEach(branch => {
      ensureSpace(doc, 36);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text(`If: ${branch.when}`, MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: BODY_LINE_GAP,
      });
      doc
        .font("Helvetica")
        .fontSize(BODY_SIZE)
        .fillColor(BODY)
        .text(`Start here: ${branch.route}`, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: BODY_LINE_GAP });
      gap(doc, 6);
    });
    bodyText(
      doc,
      "Licensed professional conduct is usually a separate parallel track through that profession's state licensing board.",
      { size: 9.5, color: MUTED }
    );

    heading(doc, `Where to report — doors for ${hasState ? stateName : "your state"}`);
    doors.forEach(door => {
      doorCard(doc, door.name, statusLabel(door.verificationStatus), door.whenToUse, door.description, door.url);
    });

    heading(doc, "National Fraud Enforcement — DOJ contact");
    bodyText(doc, NATIONAL_FRAUD_ENFORCEMENT_CONTACT.name, { bold: true });
    bodyText(doc, `Address: ${NATIONAL_FRAUD_ENFORCEMENT_CONTACT.address}`);
    bodyText(doc, `Phone: ${NATIONAL_FRAUD_ENFORCEMENT_CONTACT.phone}`);
    bodyText(doc, `Email: ${NATIONAL_FRAUD_ENFORCEMENT_CONTACT.email}`);
    bodyText(doc, "Web: https://www.justice.gov/fraud");

    heading(doc, "More reporting resources Shawn references");
    fraudReportingResources.forEach(resource => {
      ensureSpace(doc, 64);
      bodyText(doc, resource.name, { bold: true });
      bodyText(doc, resource.plainEnglish);
      bodyText(doc, `Use when: ${resource.whenToUse}`);
      bodyText(doc, `Link: ${resource.url}`, { size: 9, color: "#1D4ED8" });
    });

    heading(doc, "The four things wire fraud needs (educational)");
    wireFraudElements.forEach(el => {
      ensureSpace(doc, 48);
      bodyText(doc, el.title, { bold: true });
      bodyText(doc, el.body);
    });

    warningBox(doc, falseStatementCard.title, falseStatementCard.body);

    heading(doc, "Documentation checklist");
    bodyText(doc, factsVsConclusionsLine);
    fraudChecklistItems.forEach(item => {
      ensureSpace(doc, 18);
      doc
        .font("Helvetica")
        .fontSize(BODY_SIZE)
        .fillColor(BODY)
        .text(`☐  ${item}`, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: BODY_LINE_GAP });
      gap(doc, 3);
    });

    heading(doc, "Copy-ready complaint template");
    bodyText(doc, `Addressed to: ${primaryDoor.name}. ${fraudDocumentationGuidance}`);
    templateBlock(doc, template);

    heading(doc, "Want to know exactly what to say?");
    bodyText(doc, `The Report Kit — ${kitPrice} one-time (coming soon)`, { bold: true, size: 13 });
    bodyText(
      doc,
      "Shawn's step-by-step video course walks you through each element, each document, and each filing door. Meg translates every step into plain English — what to gather, what words to use, and what not to say."
    );
    bodyText(doc, "Expanded worksheets, annotated examples, state door directory, lifetime updates.");
    bodyText(doc, "Join the waitlist or prepay at: https://my.standwithmeg.com/tools/fraud-kit", { color: "#1D4ED8" });
    bodyText(doc, "This free packet organizes your facts. The Report Kit teaches you how to present them.", {
      size: 9.5,
      color: MUTED,
    });

    addPageFooters(doc);
    doc.end();
  });
}