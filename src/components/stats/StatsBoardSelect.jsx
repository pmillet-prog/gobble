import React from "react";
import { createPortal } from "react-dom";
import StatsTypewriterText from "./StatsTypewriterText.jsx";
import useStatsSelectPopover from "./useStatsSelectPopover.js";

const searchable = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

export default function StatsBoardSelect({ label, options, value, onChange }) {
  const id = React.useId(), triggerRef = React.useRef(null), menuRef = React.useRef(null);
  const search = React.useRef({ text: "", time: 0 });
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const selected = Math.max(0, options.findIndex(option => option.key === value));
  const close = React.useCallback(() => setOpen(false), []);
  const position = useStatsSelectPopover({ open, count: options.length, triggerRef, menuRef, close });
  const show = (index = selected) => { search.current = { text: "", time: 0 }; setActive(index); setOpen(true); };
  const choose = index => {
    const option = options[index];
    if (!option) return;
    close(); triggerRef.current?.focus({ preventScroll: true });
    if (option.key !== value) onChange(option.key);
  };
  React.useLayoutEffect(() => {
    const menu = menuRef.current, option = menu?.children[active];
    if (!menu || !option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [open, active, position]);

  const onKeyDown = event => {
    if (event.ctrlKey || event.metaKey || !options.length) return;
    const key = event.key;
    if (key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (key === "Tab") { close(); return; }
    if (event.altKey && key === "ArrowUp") { event.preventDefault(); close(); return; }
    if (event.altKey && key !== "ArrowDown") return;
    if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(key)) {
      event.preventDefault();
      const next = key === "Home" ? 0 : key === "End" ? options.length - 1 : !open ? selected
        : Math.max(0, Math.min(options.length - 1, active + ({ ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[key] || 0)));
      if (open) setActive(next); else show(next);
      return;
    }
    if (key === "Enter" || (key === " " && (!search.current.text || Date.now() - search.current.time >= 700))) {
      event.preventDefault(); if (open) choose(active); else show(); return;
    }
    if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - search.current.time < 700 ? search.current.text : "";
      const text = previous + searchable(key);
      const query = [...text].every(char => char === text[0]) ? text[0] : text;
      const start = previous && query.length > 1 ? active : (open ? active : selected) + 1;
      const index = options.findIndex((_, offset) => searchable(options[(start + offset) % options.length].label).startsWith(query));
      if (index >= 0) { setActive((start + index) % options.length); setOpen(true); }
      search.current = { text, time: now };
    }
  };

  return <div className="stats-board-picker">
    <span className="stats-choice-caption"><StatsTypewriterText>{label}</StatsTypewriterText></span>
    <button ref={triggerRef} type="button" role="combobox" className="stats-board-select" aria-label={label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="none"
      aria-activedescendant={open && position ? `${id}-option-${active}` : undefined} data-value={value}
      disabled={!options.length} onKeyDown={onKeyDown} onClick={() => open ? close() : show()}>
      <StatsTypewriterText>{options[selected]?.label || "Aucun classement"}</StatsTypewriterText>
    </button>
    {position ? createPortal(<div ref={menuRef} id={`${id}-options`} role="listbox" aria-label={label}
      className="stats-board-menu" style={position.style}>
      {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.key} role="option"
        aria-selected={option.key === value} data-value={option.key} data-active={index === active}
        className="stats-board-option" onPointerMove={event => { if (event.pointerType === "mouse") setActive(index); }}
        onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }} onClick={() => choose(index)}>
        <span><StatsTypewriterText>{option.label}</StatsTypewriterText></span><span className="stats-board-check" aria-hidden="true">{option.key === value ? "✓" : ""}</span>
      </div>)}
    </div>, position.host) : null}
  </div>;
}
