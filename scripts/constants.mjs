export const MODULE_ID = "democracy";

export const POLL_TYPE = Object.freeze({
  PROPOSAL: "proposal",
  CHOICE: "choice",
});

export const PROPOSAL_CHOICE = Object.freeze({
  APPROVE: "approve",
  DISAPPROVE: "disapprove",
  ABSTAIN: "abstain",
  FOLLOW_MAJORITY: "follow-majority",
});

export const PROPOSAL_RULE = Object.freeze({
  SIMPLE_MAJORITY: "simple-majority",
  ABSOLUTE_MAJORITY: "absolute-majority",
  MAJORITY_OF_PARTICIPANTS: "majority-of-participants",
  UNANIMITY_OF_VOTERS: "unanimity-of-voters",
  UNANIMITY_OF_ALL_MEMBERS: "unanimity-of-all-members",
  SUPERMAJORITY: "supermajority",
});

export const SUPERMAJORITY_BASIS = Object.freeze({
  VALID_VOTES: "valid-votes",
  SUBMITTED_BALLOTS: "submitted-ballots",
  ALL_ELIGIBLE: "all-eligible",
});

export const PARTICIPANT_STATUS = Object.freeze({
  PENDING: "pending",
  SUBMITTED: "submitted",
  ABSTAINED: "abstained",
  ABSENT: "absent",
  EXCLUDED: "excluded",
});

export const POLL_LIFECYCLE = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
  CANCELLED: "cancelled",
});

export const OUTCOME_STATUS = Object.freeze({
  APPROVED: "approved",
  NOT_APPROVED: "not-approved",
  WINNER: "winner",
  TIED_RESULT: "tied-result",
  NO_DECISION: "no-decision",
  QUORUM_NOT_MET: "quorum-not-met",
  CANCELLED: "cancelled",
});

export const LIMITS = Object.freeze({
  TITLE_MIN: 1,
  TITLE_MAX: 120,
  DESCRIPTION_MAX: 5000,
  OPTION_LABEL_MIN: 1,
  OPTION_LABEL_MAX: 200,
  OPTIONS_MIN: 2,
  OPTIONS_MAX: 20,
  TIMER_SECONDS_MIN: 10,
  TIMER_SECONDS_MAX: 604800,
  QUORUM_PERCENT_MIN: 1,
  QUORUM_PERCENT_MAX: 100,
  MAX_SAFE_WEIGHT: Number.MAX_SAFE_INTEGER,
});

// Exact rationals per voting-rules.md — never a float, so outcome comparisons
// stay exact under BigInt cross multiplication.
export const SUPERMAJORITY_PRESET = Object.freeze({
  SIXTY_PERCENT: Object.freeze({ numerator: 3, denominator: 5 }),
  TWO_THIRDS: Object.freeze({ numerator: 2, denominator: 3 }),
  SEVENTY_FIVE_PERCENT: Object.freeze({ numerator: 3, denominator: 4 }),
  EIGHTY_PERCENT: Object.freeze({ numerator: 4, denominator: 5 }),
});

export const DEFAULT_SUPERMAJORITY_THRESHOLD = SUPERMAJORITY_PRESET.TWO_THIRDS;
