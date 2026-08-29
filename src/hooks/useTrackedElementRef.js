import React from "react";

export default function useTrackedElementRef(initialNode = null) {
  const elementRef = React.useRef(initialNode);
  const [element, setElement] = React.useState(initialNode);

  const registerElement = React.useCallback((nextElement) => {
    elementRef.current = nextElement;
    setElement((previousElement) =>
      previousElement === nextElement ? previousElement : nextElement
    );
  }, []);

  return [elementRef, registerElement, element];
}
