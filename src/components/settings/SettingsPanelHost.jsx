import React, { Suspense } from "react";

const SoundSettingsPanel = React.lazy(() => import("../SoundSettingsPanel.jsx"));
const VisualSettingsPanel = React.lazy(() => import("../VisualSettingsPanel.jsx"));
const KeyboardSettingsPanel = React.lazy(() => import("../KeyboardSettingsPanel.jsx"));
const DevSettingsPanel = React.lazy(() => import("../DevSettingsPanel.jsx"));
const ModerationPanel = React.lazy(() => import("../ModerationPanel.jsx"));

export default function SettingsPanelHost({
  sound,
  visual,
  keyboard,
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
      {keyboard?.isOpen ? (
        <Suspense fallback={null}>
          <KeyboardSettingsPanel {...keyboard.props} />
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
