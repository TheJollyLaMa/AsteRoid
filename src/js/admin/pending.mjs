export function pendingCounts({ stamps = null, payroll = null, arena = null } = {}) {
  const count = value => Array.isArray(value) ? value.length : 0;
  return {
    stamps: count(stamps?.pending),
    prizes: count(payroll?.pending?.filter?.(entry => entry.kind === 'supporter-prize' || entry.kind === 'supporterPrize')),
    payroll: count(payroll?.pending),
    arena: count(arena?.pending),
  };
}
export function waitingTotal(counts) { return counts.stamps + counts.prizes + counts.arena; }
