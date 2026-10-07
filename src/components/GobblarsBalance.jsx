import React from "react";
import "./gobblarsBalance.css";

const formatter = new Intl.NumberFormat("fr-FR");

export default function GobblarsBalance({ balance = 0, className = "", onClick }) {
  const value = Number(balance);
  const amount = formatter.format(Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  const Tag = onClick ? "button" : "div";
  return <Tag className={`gobblars-balance ${className}`} aria-label={`${amount} gobblars${onClick ? " · Voir l’historique des gobblars" : ""}`}
    {...(onClick ? { type: "button", onClick, "aria-haspopup": "dialog", title: "Historique des gobblars" } : {})}>
    <img src="/Gobblars.png" width="32" height="32" alt="" />
    <div><strong>{amount}</strong><span>Gobblars</span></div>
  </Tag>;
}
