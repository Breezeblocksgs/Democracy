import { POLL_TYPE } from "../constants.mjs";
import { tallyProposal, tallyChoice } from "./voting-rules.mjs";

/**
 * Provisional live tally as a plain, JSON-serializable object — never a Map.
 * Values that get persisted through a Foundry Setting/flag go through JSON
 * serialization, and a Map silently loses its entries there. Proposal
 * Follow Majority stays unresolved ("Pending Delegation") until closure.
 */
export function computeLiveTally(snapshot, ballots) {
  if (snapshot.pollType === POLL_TYPE.PROPOSAL) {
    const { A0, D0, S0, F } = tallyProposal(snapshot, ballots);
    return { approve: A0, disapprove: D0, abstain: S0, pendingDelegation: F };
  }
  return Object.fromEntries(tallyChoice(snapshot, ballots));
}

/** Shape a plain liveTally object into the {label, count} rows every template renders. */
export function formatLiveTallyRows(pollType, liveTally, options, proposalChoiceLabels) {
  if (!liveTally) return null;
  const rows =
    pollType === POLL_TYPE.PROPOSAL
      ? [
          { label: proposalChoiceLabels.approve, count: liveTally.approve ?? 0 },
          { label: proposalChoiceLabels.disapprove, count: liveTally.disapprove ?? 0 },
          { label: proposalChoiceLabels.abstain, count: liveTally.abstain ?? 0 },
          { label: proposalChoiceLabels.pendingDelegation, count: liveTally.pendingDelegation ?? 0 },
        ]
      : (options ?? []).map((option) => ({ label: option.label, count: liveTally[option.id] ?? 0 }));
  return { rows };
}
