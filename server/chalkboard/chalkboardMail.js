import nodemailer from "nodemailer";
import { readChalkboardMailPassword } from "./chalkboardMailSecret.js";

export function chalkboardMailConfig(env = process.env) {
  const from = env.GOBBLE_CHALKBOARD_MAIL_FROM || env.SMTP_FROM || "support@gobble.fr";
  const to = env.GOBBLE_CHALKBOARD_MAIL_TO || "pmillet@gmail.com";
  if (env.GOBBLE_MAIL_TRANSPORT === "sendmail") return {
    from, to, transport: { sendmail: true, newline: "unix", path: env.GOBBLE_SENDMAIL_PATH || "/usr/sbin/sendmail" },
  };
  const host = env.SMTP_HOST;
  if (!host) return null;
  const port = Number(env.SMTP_PORT || 465);
  return { from, to, transport: {
    host, port, secure: port === 465, requireTLS: port !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: readChalkboardMailPassword(env) } } : {}),
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  } };
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
