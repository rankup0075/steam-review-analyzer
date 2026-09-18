import { CATEGORIES, type Category, type ClassifiedReview, type Severity, type SteamReview } from "./types";

export interface CategoryStat {
  category: Category;
  positive: number;
  negative: number;
  mixed: number;
  total: number;
}

export interface Aggregate {
  total: number;
  recommended: number;
  recommendRate: number;
  categories: CategoryStat[];
  severity: Record<Severity, number>;
  unanalyzed: number;
}

/** AI를 쓰지 않는 결정적 통계. 숫자는 항상 코드로 계산해 AI의 계산 실수를 피한다. */
export function aggregate(reviews: SteamReview[], classified: ClassifiedReview[]): Aggregate {
  const stats = new Map<Category, CategoryStat>(
    CATEGORIES.map((c) => [c, { category: c, positive: 0, negative: 0, mixed: 0, total: 0 }]),
  );
  const severity: Record<Severity, number> = { high: 0, medium: 0, low: 0, none: 0 };

  for (const c of classified) {
    severity[c.severity]++;
    for (const cat of c.categories) {
      const s = stats.get(cat)!;
      s[c.sentiment]++;
      s.total++;
    }
  }

  const recommended = reviews.filter((r) => r.votedUp).length;

  return {
    total: reviews.length,
    recommended,
    recommendRate: reviews.length ? Math.round((recommended / reviews.length) * 100) : 0,
    categories: [...stats.values()]
      .filter((s) => s.total > 0)
      .sort(
        (a, b) =>
          Number(a.category === "other") - Number(b.category === "other") ||
          b.negative + b.mixed - (a.negative + a.mixed) ||
          b.total - a.total,
      ),
    severity,
    unanalyzed: classified.filter((c) => c.unanalyzed).length,
  };
}
