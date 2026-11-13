import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "./db";
import { BRAND } from "./utils";

export function newCertId() {
  return `FA-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Issues a certificate once all videos are complete AND the quiz (if any) is passed. */
export async function maybeIssueCertificate(userId: string, courseId: string) {
  const existing = await db.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;
  const course = await db.course.findUnique({ where: { id: courseId }, include: { videos: true, quiz: true } });
  if (!course || !course.videos.length) return null;
  const done = await db.progress.count({ where: { userId, completed: true, videoId: { in: course.videos.map((v) => v.id) } } });
  if (done < course.videos.length) return null;
  let score: number | null = null;
  if (course.quiz) {
    const pass = await db.attempt.findFirst({ where: { userId, quizId: course.quiz.id, passed: true }, orderBy: { score: "desc" } });
    if (!pass) return null;
    score = pass.score;
  }
  return db.certificate.create({ data: { certId: newCertId(), userId, courseId, score } });
}

export async function renderCertificatePdf(certId: string, origin: string) {
  const cert = await db.certificate.findUnique({ where: { certId }, include: { user: true, course: true } });
  if (!cert) return null;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const [W, H] = [842, 595];
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.09, 0.2), orange = rgb(1, 0.48, 0.1), grey = rgb(0.4, 0.45, 0.55);
  const center = (t: string, y: number, size: number, font = sans, color = navy) =>
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.985, 0.985, 0.99) });
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: navy });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 6, color: orange });
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: navy, borderWidth: 1.2 });
  page.drawText(BRAND.toUpperCase(), { x: 60, y: H - 62, size: 26, font: sansB, color: rgb(1, 1, 1) });
  page.drawText("INDUSTRIAL TRAINING PROGRAMME", { x: 60, y: H - 84, size: 10, font: sans, color: orange });

  center("CERTIFICATE OF COMPLETION", H - 190, 34, serif);
  center("This is to certify that", H - 235, 14, sans, grey);
  center(cert.user.name, H - 290, 40, serif, orange);
  page.drawLine({ start: { x: 220, y: H - 302 }, end: { x: W - 220, y: H - 302 }, thickness: 0.8, color: grey });
  center("has successfully completed the training module", H - 335, 14, sans, grey);
  center(cert.course.title, H - 375, 24, sansB);
  if (cert.score != null) center(`Assessment score: ${cert.score}%`, H - 405, 13, sans, grey);

  const date = cert.issuedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  page.drawText("DATE OF ISSUE", { x: 70, y: 100, size: 9, font: sansB, color: grey });
  page.drawText(date, { x: 70, y: 80, size: 15, font: sansB, color: navy });
  page.drawText("CERTIFICATE ID", { x: 70, y: 58, size: 9, font: sansB, color: grey });
  page.drawText(cert.certId, { x: 70, y: 40, size: 12, font: sansB, color: orange });

  const verifyUrl = `${origin}/verify/${cert.certId}`;
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240 }));
  page.drawImage(qr, { x: W - 150, y: 40, width: 90, height: 90 });
  page.drawText("Scan to verify", { x: W - 143, y: 30, size: 9, font: sans, color: grey });
  const note = `Verify at ${origin.replace(/^https?:\/\//, "")}/verify`;
  page.drawText(note, { x: (W - sans.widthOfTextAtSize(note, 9)) / 2, y: 40, size: 9, font: sans, color: grey });

  return { bytes: await pdf.save(), cert };
}
