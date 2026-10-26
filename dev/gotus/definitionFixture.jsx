import React from "react";
import DefinitionOverlays from "../../src/components/definition/DefinitionOverlays.jsx";

// Exercise the real definition dialog; its contents stay local to this fixture.
export function useDefinitionFixture() {
  const [definitionModal, setDefinitionModal] = React.useState({ open: false });
  const openDefinition = React.useCallback(word => {
    window.gotusFixture.definitionCalls ??= [];
    window.gotusFixture.definitionCalls.push(word);
    setDefinitionModal({ open: true, word, title: word, ok: true, loading: false,
      definition: "Objet gonflable, généralement rond, utilisé pour jouer.", preferLongDefinition: true });
  }, []);
  const overlay = <DefinitionOverlays runtime={{ definitionModal, openDefinition,
    closeDefinition: () => setDefinitionModal({ open: false }), wordInfoModal: { open: false },
    GUIDED_RESULTS_STEPS: {}, playCloseSound: () => {}, isAccountAuthenticated: false,
  }} />;
  return { openDefinition, overlay };
}
