import React, { Suspense } from "react";

const SoundSettingsPanel = React.lazy(() => import("../SoundSettingsPanel.jsx"));
const VisualSettingsPanel = React.lazy(() => import("../VisualSettingsPanel.jsx"));
const DevSettingsPanel = React.lazy(() => import("../DevSettingsPanel.jsx"));
const ModerationPanel = React.lazy(() => import("../ModerationPanel.jsx"));

export default function SettingsPanelHost({
  sound,
  visual,
  dev,
  moderation,
}) {
  return (
    <>
      {sound?.isOpen ? (
        <Suspense fallback={null}>
          <SoundSettingsPanel {...sound.props} />
        </Suspense>
      ) : null}
      {visual?.isOpen ? (
        <Suspense fallback={null}>
          <VisualSettingsPanel {...visual.props} />
        </Suspense>
      ) : null}
      {dev?.isOpen ? (
        <Suspense fallback={null}>
          <DevSettingsPanel {...dev.props} />
        </Suspense>
      ) : null}
      {moderation?.isOpen ? (
        <Suspense fallback={null}>
          <ModerationPanel {...moderation.props} />
        </Suspense>
      ) : null}
    </>
  );
}
