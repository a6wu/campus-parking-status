export function aggregatePermitTypes(structures) {
  const totals = new Map();

  for (const structure of structures) {
    for (const item of structure.availability || []) {
      const current = totals.get(item.type) || { type: item.type, open: 0, total: 0 };
      current.open += Number(item.open) || 0;
      current.total += Number(item.total) || 0;
      totals.set(item.type, current);
    }
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}
