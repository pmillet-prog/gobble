import React from "react";

import HomeChatModalHost from "../HomeChatModalHost.jsx";
import MobileChatLayer from "./MobileChatLayer.jsx";

function shallowEqualObject(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function GlobalChatLayer({ mobileProps = {}, homeProps = {} }) {
  return (
    <>
      <MobileChatLayer {...mobileProps} />
      <HomeChatModalHost {...homeProps} />
    </>
  );
}

export default React.memo(
  GlobalChatLayer,
  (prev, next) =>
    shallowEqualObject(prev.mobileProps, next.mobileProps) &&
    shallowEqualObject(prev.homeProps, next.homeProps)
);
