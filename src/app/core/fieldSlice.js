export function reduceFieldSlice(state, action, contract) {
  if (action?.type === contract.fieldChanged) {
    const field = action.payload?.field;
    if (!contract.fields.has(field)) return state;
    const value = action.payload?.value;
    if (Object.is(state[field], value)) return state;
    return Object.freeze({ ...state, [field]: value });
  }

  if (action?.type === contract.patched) {
    const rawPatch = action.payload;
    if (!rawPatch || typeof rawPatch !== "object") return state;
    const patch = {};
    let changed = false;
    for (const [field, value] of Object.entries(rawPatch)) {
      if (!contract.fields.has(field) || Object.is(state[field], value)) continue;
      patch[field] = value;
      changed = true;
    }
    return changed ? Object.freeze({ ...state, ...patch }) : state;
  }

  return state;
}
