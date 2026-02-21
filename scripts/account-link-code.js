#!/usr/bin/env node

const ACCOUNT_LINK_CODE_PREFIX = "GBL1";
const MAX_INSTALL_ID_LEN = 128;

function normalizeInstallIdForLink(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_INSTALL_ID_LEN) return "";
  return trimmed;
}

function computeLinkCodeChecksum(raw) {
  const input = String(raw || "");
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(-6);
}

function encodeBase64Url(raw) {
  return Buffer.from(String(raw || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(raw) {
  const input = String(raw || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!input) return "";
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function buildAccountLinkCode(installId) {
  const safeInstallId = normalizeInstallIdForLink(installId);
  if (!safeInstallId) return "";
  const payload = encodeBase64Url(safeInstallId);
  if (!payload) return "";
  const checksum = computeLinkCodeChecksum(payload);
  return `${ACCOUNT_LINK_CODE_PREFIX}-${payload}-${checksum}`;
}

function parseAccountLinkCode(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) return { ok: false, error: "empty" };
  const compact = raw.replace(/[‐‑‒–—﹘﹣－]/g, "-").replace(/\s+/g, "");
  const match = compact.match(/^([A-Za-z0-9]+)-([A-Za-z0-9_-]+)-([A-Za-z0-9]+)$/);
  if (!match) return { ok: false, error: "format" };
  const prefix = String(match[1] || "").toUpperCase();
  if (prefix !== ACCOUNT_LINK_CODE_PREFIX) return { ok: false, error: "prefix" };
  const payload = String(match[2] || "");
  const checksum = String(match[3] || "").toLowerCase();
  const expected = computeLinkCodeChecksum(payload);
  if (checksum !== expected) return { ok: false, error: "checksum" };
  const decodedInstallId = normalizeInstallIdForLink(decodeBase64Url(payload));
  if (!decodedInstallId) return { ok: false, error: "install_id" };
  return { ok: true, installId: decodedInstallId };
}

function printUsage() {
  console.log("Usage:");
  console.log("  npm run link:code -- <installId>");
  console.log("  npm run link:decode -- <code>");
  console.log("  node scripts/account-link-code.js --decode <code>");
  console.log("");
  console.log("Examples:");
  console.log("  npm run link:code -- dc45d876-92a0-4f10-a688-60adb8fba02f");
  console.log("  npm run link:decode -- GBL1-ZGM0NWQ4NzYtOTJhMC00ZjEwLWE2ODgtNjBhZGI4ZmJhMDJm-jjwaco");
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args[0] === "--decode") {
    const code = args.slice(1).join(" ").trim();
    if (!code) {
      console.error("Missing code.");
      process.exit(1);
    }
    const parsed = parseAccountLinkCode(code);
    if (!parsed.ok) {
      console.error(`Invalid code (${parsed.error}).`);
      process.exit(1);
    }
    console.log(parsed.installId);
    return;
  }

  const installId = args.join(" ").trim();
  const code = buildAccountLinkCode(installId);
  if (!code) {
    console.error("Invalid installId.");
    process.exit(1);
  }
  console.log(code);
}

main();
