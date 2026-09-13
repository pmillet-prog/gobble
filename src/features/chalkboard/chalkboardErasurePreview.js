// Keep unchanged intervention references stable between pointer frames. Only
// contributions targeted by the sponge need their published tiles repainted.
export class ChalkboardErasurePreview {
  constructor() { this.records = new Map(); this.memo = null; }

  apply(interventions, elements) {
    const masks = elements.filter(element => element.type === "erase");
    if (this.memo?.source === interventions && this.memo.masks.length === masks.length &&
      this.memo.masks.every((record, index) => record.mask === masks[index] && record.count === masks[index].points.length && record.targets === masks[index].targetIds?.length)) return this.memo.result;
    const byTarget = new Map();
    for (const element of elements) {
      if (element.type !== "erase") continue;
      for (const id of element.targetIds || []) {
        if (!byTarget.has(id)) byTarget.set(id, []);
        byTarget.get(id).push(element);
      }
    }
    if (!byTarget.size) { this.records.clear(); return interventions; }
    const records = new Map();
    const result = interventions.map(source => {
      const masks = byTarget.get(source.id);
      if (!source.canErase || !masks?.length) return source;
      const previous = this.records.get(source.id);
      const signature = masks.map(mask => `${mask.id}:${mask.points.length}`).join("|");
      const record = previous?.source === source && previous.signature === signature ? previous : {
        source, signature, preview: { ...source, elements: [...source.elements, ...masks] },
      };
      records.set(source.id, record);
      return record.preview;
    });
    this.records = records;
    this.memo = { source: interventions, masks: masks.map(mask => ({ mask, count: mask.points.length, targets: mask.targetIds?.length })), result };
    return result;
  }

  clear() { this.records.clear(); this.memo = null; }
}
