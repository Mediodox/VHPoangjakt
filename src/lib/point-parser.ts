export type ParserChallenge = {
  id: string;
  title: string;
  tags: string[] | null;
  default_points: number;
};

export type ParseResult = {
  isCandidate: boolean;
  points: number | null;
  challengeId: string | null;
  confidence: number;
  notes: string;
};

const pointsPatterns = [
  /#vhpoint\s*[:=-]?\s*(\d{1,4})/i,
  /\b(\d{1,4})\s*poäng\b/i,
  /\b(\d{1,4})\s*p\b/i
];

export function parseCaptionToCandidate(
  caption: string | null,
  challenges: ParserChallenge[]
): ParseResult {
  const text = (caption ?? "").trim();
  if (!text) {
    return {
      isCandidate: false,
      points: null,
      challengeId: null,
      confidence: 0,
      notes: "No caption text"
    };
  }

  const hasCompetitionTag =
    /#vhpoint/i.test(text) || /#vhpoäng/i.test(text) || /#poangjakt/i.test(text);

  let points: number | null = null;
  for (const pattern of pointsPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      points = Number(match[1]);
      break;
    }
  }

  let bestChallenge: ParserChallenge | null = null;
  for (const challenge of challenges) {
    const bag = [challenge.title, ...(challenge.tags ?? [])];
    if (bag.some((entry) => text.toLowerCase().includes(entry.toLowerCase()))) {
      bestChallenge = challenge;
      break;
    }
  }

  const inferredPoints =
    points ?? (bestChallenge?.default_points ? bestChallenge.default_points : null);
  const isCandidate = hasCompetitionTag || bestChallenge !== null;

  let confidence = 0.15;
  if (hasCompetitionTag) confidence += 0.35;
  if (points !== null) confidence += 0.3;
  if (bestChallenge) confidence += 0.2;
  confidence = Math.min(1, Number(confidence.toFixed(3)));

  return {
    isCandidate,
    points: inferredPoints,
    challengeId: bestChallenge?.id ?? null,
    confidence,
    notes: [
      hasCompetitionTag ? "competition_tag" : null,
      points !== null ? "explicit_points" : "no_explicit_points",
      bestChallenge ? `challenge=${bestChallenge.title}` : "no_challenge_match"
    ]
      .filter(Boolean)
      .join(", ")
  };
}
