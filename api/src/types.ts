export type HolderRow = {
  rank: number;
  address: string;
  heldTokens: number;
  heldSinceUnix: number;
  weightPpm: number;
  earnedSol: number;
};

export type HolderSnapshot = {
  items: HolderRow[];
  source: "chain" | "mock";
  fetchedAtUnix: number | null;
  error: string | null;
};
