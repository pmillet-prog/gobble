import React from 'react';
import MobileChatLayer from '../../components/chat/MobileChatLayer.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';

export function useChatSurface(props) {
  const feature = useFeatureRuntime('chatSurface');
  React.useLayoutEffect(() => { feature.configure(props); }, [feature, props]);
  React.useEffect(() => () => feature.clear(), [feature]);
}

export default function ChatSurfaceSatellite() {
  const feature = useFeatureRuntime('chatSurface');
  const props = useFeatureSelector(feature, state => state.props);
  return props ? <MobileChatLayer {...props} /> : null;
}
