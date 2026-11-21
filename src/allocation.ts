// Waterfall in item order on tax-inclusive amounts. It depends only on the total paid so far
// so no payment history is stored. Proportional splits would depend on payment order through rounding
export function allocate<T extends { gross: number }>(lines: readonly T[], paidBefore: number, amount: number) {
  const total = lines.reduce((sum, line) => sum + line.gross, 0);
  const covered = Math.min(paidBefore + amount, total);
  let offset = 0;
  return lines.map((line) => {
    const filled = (paid: number) => Math.min(Math.max(paid - offset, 0), line.gross);
    const applied = filled(covered) - filled(paidBefore);
    const balance = line.gross - filled(covered);
    offset += line.gross;
    return { ...line, applied, balance };
  });
}
