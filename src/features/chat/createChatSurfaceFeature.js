import { createFeatureStore } from '../../app/core/createFeatureStore.js';

// A single drawer host survives changes of game screen. Messages and drafts
// remain owned by the chat service; this stores only its UI bindings.
export function createChatSurfaceFeature({ scope }) {
  const store = createFeatureStore({ props: null });
  const clear = () => store.set('props', null);
  return { store, clear,
    configure(props) {
      const previous = store.getState().props;
      if (previous && Object.keys(props).length === Object.keys(previous).length &&
        Object.keys(props).every(key => Object.is(props[key], previous[key]))) return;
      store.set('props', props);
    },
    openChat() { store.getState().props?.onOpenChat?.(); },
    openPlayers() { store.getState().props?.onOpenPlayers?.(); },
    start() { scope.add(clear); },
  };
}
