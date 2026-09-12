export type PetKind = "spider";
export type PetStatus = "wander" | "chase" | "evade" | "sleep" | "drag" | "fall";

export type PetPreferences = {
  kind: PetKind | null;
  activity: number;
  chaseCursor: boolean;
};

export type SpiderLegState = {
  footX: number;
  footY: number;
  planted: boolean;
  swing: number;
  stepFromX: number;
  stepFromY: number;
  stepToX: number;
  stepToY: number;
};

export type SpiderState = {
  status: PetStatus;
  x: number;
  y: number;
  vx: number;
  vy: number;
  legPhase: number;
  heading: number;
  headingTarget: number;
  headingTimer: number;
  wanderPhase: number;
  wanderSince: number;
  chaseSince: number;
  webAnchor: { x: number; y: number } | null;
  legs: SpiderLegState[];
};
