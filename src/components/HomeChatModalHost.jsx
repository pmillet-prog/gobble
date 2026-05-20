import React, { Suspense } from "react";

const HomeChatModal = React.lazy(() => import("./HomeChatModal.jsx"));

export default function HomeChatModalHost({ open, ...props }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <HomeChatModal open={open} {...props} />
    </Suspense>
  );
}
