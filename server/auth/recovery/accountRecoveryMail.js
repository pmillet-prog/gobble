import nodemailer from "nodemailer";
import { mailTransportConfig } from "../../mail/mailTransport.js";

export function accountRecoveryMailConfig(env = process.env) {
  const transport = mailTransportConfig(env);
  if (!transport) throw new Error("mail_unavailable");
  const url = new URL(env.GOBBLE_PUBLIC_URL || "https://gobble.fr");
  const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) {
    throw new Error("mail_unavailable");
  }
  return {
    transport, origin: url.origin,
    from: env.GOBBLE_ACCOUNT_MAIL_FROM || env.SMTP_FROM || "support@gobble.fr",
    supportTo: "pmillet@gmail.com",
  };
}

export function passwordResetMessage({ username, email, token }, config) {
  // The fragment never reaches HTTP access logs or a Referer header.
  const link = `${config.origin}/reset-password#token=${encodeURIComponent(token)}`;
  return {
    from: config.from, to: { address: email },
    subject: "Gobble — réinitialiser ton mot de passe",
    text: `Bonjour ${username},\n\nUne demande de réinitialisation du mot de passe de ton compte Gobble a été faite.\n\nChoisis ton nouveau mot de passe ici :\n${link}\n\nCe lien est valable 30 minutes et ne peut être utilisé qu'une seule fois. Ton mot de passe actuel reste valable tant que tu ne le modifies pas.\n\nSi tu n'es pas à l'origine de cette demande, ignore ce message. Ne communique ce lien à personne.\n\nBesoin d'aide ? support@gobble.fr\n`,
  };
}

export function accountSupportMessage({ username, message, replyEmail }, config) {
  return {
    from: config.from, to: { address: config.supportTo },
    ...(replyEmail ? { replyTo: { address: replyEmail } } : {}),
    subject: "Gobble — demande d’aide pour un compte",
    text: `Demande envoyée depuis le formulaire public de Gobble.\nL'identité du demandeur n'a pas été vérifiée.\n\nPseudo indiqué : ${username}\nContact indiqué : ${replyEmail || "non renseigné"}\n\nMessage :\n${message}\n`,
  };
}

export async function sendAccountRecoveryMail(message, config) {
  const transport = nodemailer.createTransport(config.transport);
  try {
    const result = await transport.sendMail({ ...message, disableFileAccess: true, disableUrlAccess: true });
    if (result.rejected?.length) throw new Error("mail_unavailable");
  } finally { transport.close(); }
}
