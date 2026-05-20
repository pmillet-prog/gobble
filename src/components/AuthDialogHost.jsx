import React, { Suspense } from "react";

const AuthDialog = React.lazy(() => import("./AuthDialog.jsx"));

export default function AuthDialogHost({
  mode,
  darkMode,
  form,
  error,
  info,
  loading,
  mustResetPassword,
  onClose,
  onSubmit,
  onFieldChange,
  onModeChange,
}) {
  if (!mode) return null;
  return (
    <Suspense fallback={null}>
      <AuthDialog
        open={!!mode}
        mode={mode}
        darkMode={darkMode}
        form={form}
        error={error}
        info={info}
        loading={loading}
        mustResetPassword={mustResetPassword}
        onClose={onClose}
        onSubmit={onSubmit}
        onFieldChange={onFieldChange}
        onModeChange={onModeChange}
      />
    </Suspense>
  );
}
