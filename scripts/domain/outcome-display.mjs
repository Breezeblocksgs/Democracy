/** Map winning option ids back to their labels, in snapshot option order. */
export function resolveWinnerLabels(options, winnerIds) {
  if (!winnerIds || winnerIds.length === 0) return [];
  const winnerSet = new Set(winnerIds);
  return (options ?? []).filter((option) => winnerSet.has(option.id)).map((option) => option.label);
}

/**
 * Cinematic reveal summary for a closed Choice poll: winner label(s), the
 * winning vote count, and its percentage of all votes cast. A tie reports
 * every tied option instead of a single winner/count/percentage.
 */
export function computeChoiceResultSummary(outcome, options) {
  const support = outcome?.support ?? {};
  const totalVotes = Object.values(support).reduce((sum, value) => sum + value, 0);
  const winners = outcome?.winners ?? [];
  const tied = winners.length > 1;

  if (winners.length === 0) {
    return { tied: false, winnerLabels: [], votes: 0, percentage: 0 };
  }

  const winnerLabels = resolveWinnerLabels(options, winners);
  const votes = support[winners[0]] ?? 0;
  const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

  return { tied, winnerLabels, votes, percentage };
}
