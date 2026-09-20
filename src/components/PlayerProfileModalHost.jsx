import React, { Suspense } from "react";

const PlayerProfileModal = React.lazy(() => import("./PlayerProfileModal.jsx"));

export default function PlayerProfileModalHost({
  open,
  darkMode,
  loading,
  error,
  profile,
  viewerUserId,
  gobblarsBalance,
  nickname,
  onClose,
}) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <PlayerProfileModal
        key={profile?.userId || "loading"}
        open={open}
        darkMode={darkMode}
        loading={loading}
        error={error}
        profile={profile}
        viewerUserId={viewerUserId}
        gobblarsBalance={gobblarsBalance}
        nickname={nickname}
        onClose={onClose}
      />
    </Suspense>
  );
}
