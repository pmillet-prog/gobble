import React from "react";

export default function InfortuneCountdown({ until, label }) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    setNow(Date.now());
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return <p className="infortune-countdown" data-urgent={seconds <= 5}>
    <span>{label}</span><strong role="timer" aria-label={`${seconds} secondes restantes`}>{seconds} s</strong>
  </p>;
}
