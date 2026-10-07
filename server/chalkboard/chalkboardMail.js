import nodemailer from "nodemailer";
import { mailTransportConfig } from "../mail/mailTransport.js";

export function isChalkboardMailEnabled(env = process.env) {
  return env.NODE_ENV === "production";
}

export function chalkboardMailConfig(env = process.env) {
  if (!isChalkboardMailEnabled(env)) return null;
  const from = env.GOBBLE_CHALKBOARD_MAIL_FROM || env.SMTP_FROM || "support@gobble.fr";
  const to = env.GOBBLE_CHALKBOARD_MAIL_TO || "pmillet@gmail.com";
  const transport = mailTransportConfig(env);
  return transport ? { from, to, transport } : null;
}

export async function sendChalkboardPng({ id, weekId, filename }, config = chalkboardMailConfig()) {
  if (!config) throw Object.assign(new Error("mail_not_configured"), { code: "mail_not_configured" });
  const transport = nodemailer.createTransport(config.transport);
  try {
    const result = await transport.sendMail({
      from: config.from, to: config.to,
      messageId: `<chalkboard-${id}@gobble.fr>`,
      subject: `Le grand tableau — semaine du ${weekId}`,
      text: `Voici la copie du grand tableau de Gobble pour la semaine du ${weekId}.`,
      attachments: [{ filename: `grand-tableau-${weekId}.png`, path: filename, contentType: "image/png" }],
      disableUrlAccess: true,
    });
    if (result.rejected?.length) throw Object.assign(new Error("mail_recipient_rejected"), { code: "mail_recipient_rejected" });
    return { sent: true };
  } finally { transport.close(); }
}
