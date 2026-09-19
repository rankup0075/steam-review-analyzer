import { bucketOf, playtimeAtReview, PLAYTIME_BUCKETS, type PlaytimeBucket } from "./playtime";
import { CATEGORIES, type Category, type ClassifiedReview, type Severity, type SteamReview } from "./types";

export interface CategoryStat {
  category: Category;
  positive: number;
  negative: number;
  mixed: number;
  total: number;
}

export interface PlaytimeStat {
  bucket: PlaytimeBucket;
  total: number;
  recommended: number;
  recommendRate: number;
  /** 이 구간 부정·혼합 리뷰에서 많이 나온 주제 (최대 2개) */
  topComplaints: { category: Category; count: number }[];
}

/** 불만 주제로 세지 않는 카테고리 (구체적인 개선점이 아님) */
const NOT_ACTIONABLE: Category[] = ["overall", "other"];

export interface Aggregate {
  total: number;
  recommended: number;
  recommendRate: number;
  categories: CategoryStat[];
  severity: Record<Severity, number>;
  unanalyzed: number;
  playtime: PlaytimeStat[];
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

  // 플레이 시간 구간별 통계
  const classById = new Map(classified.map((c) => [c.id, c]));
  const playtime: PlaytimeStat[] = PLAYTIME_BUCKETS.map((bucket) => {
    const inBucket = reviews.filter((r) => bucketOf(playtimeAtReview(r)).id === bucket.id);
    const rec = inBucket.filter((r) => r.votedUp).length;
    const complaints = new Map<Category, number>();
    for (const r of inBucket) {
      const c = classById.get(r.id);
      if (!c || c.sentiment === "positive") continue;
      for (const cat of c.categories) {
        if (!NOT_ACTIONABLE.includes(cat)) complaints.set(cat, (complaints.get(cat) ?? 0) + 1);
      }
    }
    return {
      bucket,
      total: inBucket.length,
      recommended: rec,
      recommendRate: inBucket.length ? Math.round((rec / inBucket.length) * 100) : 0,
      topComplaints: [...complaints.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([category, count]) => ({ category, count })),
    };
  });

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
    playtime,
  };
}
