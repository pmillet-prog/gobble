import React, { Suspense } from "react";

const PlayerProfileModal = React.lazy(() => import("./PlayerProfileModal.jsx"));

export default function PlayerProfileModalHost({
  open,
  darkMode,
  loading,
  error,
  profile,
  onClose,
}) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <PlayerProfileModal
        open={open}
        darkMode={darkMode}
        loading={loading}
        error={error}
        profile={profile}
        onClose={onClose}
      />
    </Suspense>
  );
}
