export type ClassRow = {
  id: string;
  name: string;
  instagram_handle: string;
  active: boolean;
};

export type ChallengeRow = {
  id: string;
  title: string;
  default_points: number;
  tags: string[] | null;
  active: boolean;
};

export type PointEventRow = {
  id: string;
  class_id: string;
  challenge_id: string | null;
  points: number;
  reason: string;
  source_post_id: string | null;
  approved_by: string | null;
  approved_at: string;
  created_at: string;
};

export type CandidateStatus = "pending" | "approved" | "rejected";

export type PointCandidateRow = {
  id: string;
  class_id: string | null;
  challenge_id: string | null;
  instagram_post_id: string;
  parsed_points: number | null;
  confidence: number;
  status: CandidateStatus;
  parser_notes: string | null;
  created_at: string;
};

export type LeaderboardRow = {
  class_id: string;
  class_name: string;
  instagram_handle: string;
  total_points: number;
};

export type ClassHeartTotalRow = {
  class_id: string;
  class_name: string;
  instagram_handle: string;
  heart_count: number;
};

export type MostLovedClassRow = {
  class_id: string;
  class_name: string;
  instagram_handle: string;
  heart_count: number;
};

export type ClassStreakRow = {
  class_id: string;
  class_name: string;
  instagram_handle: string;
  streak_days: number;
};
