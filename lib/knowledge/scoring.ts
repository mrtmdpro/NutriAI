/**
 * Quality Index scoring.
 *
 * Three components, each capped:
 *   - lab_test_score:           [0, 40]  — third-party testing rigor
 *   - ingredient_quality_score: [0, 30]  — purity, form, bioavailability
 *   - price_per_dose_score:     [0, 30]  — cost-effectiveness
 *
 * Total = sum, capped at 100. Tier mapping mirrors
 * `public.tier_for_score()` in the SQL migration.
 */

export type QualityTier = "S" | "A" | "B" | "C";

export const SCORE_BOUNDS = {
  lab: { min: 0, max: 40 },
  ingredient: { min: 0, max: 30 },
  price: { min: 0, max: 30 },
} as const;

export function tierForScore(total: number): QualityTier {
  if (total >= 85) return "S";
  if (total >= 70) return "A";
  if (total >= 55) return "B";
  return "C";
}

export type ScoreInputs = {
  /** [0,1] confidence in third-party lab testing (e.g. NSF/USP/Informed-Choice). */
  labRigor: number;
  /** [0,1] purity + bioavailability + form quality. */
  ingredientQuality: number;
  /** [0,1] cost-effectiveness vs market median for same active ingredient. */
  priceEfficiency: number;
};

export type ScoreOutput = {
  lab_test_score: number;
  ingredient_quality_score: number;
  price_per_dose_score: number;
  total_score: number;
  tier: QualityTier;
};

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function computeScore(inputs: ScoreInputs): ScoreOutput {
  const lab = clamp01(inputs.labRigor) * SCORE_BOUNDS.lab.max;
  const ing = clamp01(inputs.ingredientQuality) * SCORE_BOUNDS.ingredient.max;
  const price = clamp01(inputs.priceEfficiency) * SCORE_BOUNDS.price.max;
  const total = lab + ing + price;
  return {
    lab_test_score: round2(lab),
    ingredient_quality_score: round2(ing),
    price_per_dose_score: round2(price),
    total_score: round2(total),
    tier: tierForScore(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
