export const CATEGORIES = [
  "overall",
  "performance",
  "bug",
  "balance",
  "content",
  "ux",
  "network",
  "monetization",
  "story",
  "audiovisual",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  overall: "전반적 만족도",
  performance: "최적화·성능",
  bug: "버그·크래시",
  balance: "밸런스·난이도",
  content: "콘텐츠 볼륨",
  ux: "UI·조작감",
  network: "서버·매칭",
  monetization: "가격·과금",
  story: "스토리·세계관",
  audiovisual: "그래픽·사운드",
  other: "기타",
};

export const SENTIMENTS = ["positive", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];
export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "긍정",
  negative: "부정",
  mixed: "혼합",
};

export const SEVERITIES = ["high", "medium", "low", "none"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "심각",
  medium: "보통",
  low: "경미",
  none: "문제 없음",
};

export type ReviewLanguage = "koreana" | "english" | "all";
export type ReviewSort = "recent" | "all";

export interface SteamReview {
  id: string;
  text: string;
  votedUp: boolean;
  playtimeHours: number;
  createdAt: number;
  votesUp: number;
  language: string;
}

export interface GameInfo {
  appId: string;
  name: string;
  headerImage?: string;
  reviewScoreDesc?: string;
  totalReviews?: number;
}

export interface ClassifiedReview {
  id: string;
  sentiment: Sentiment;
  categories: Category[];
  severity: Severity;
  summary: string;
  /** AI 응답에서 누락되어 기본값으로 채운 경우 */
  unanalyzed?: boolean;
}

export interface Issue {
  title: string;
  category: Category;
  severity: Severity;
  description: string;
  reviewIds: string[];
}

export interface Strength {
  title: string;
  description: string;
}

export interface AnalysisSummary {
  overview: string;
  issues: Issue[];
  strengths: Strength[];
  recommendations: string[];
}

export interface SteamApiResponse {
  game: GameInfo;
  reviews: SteamReview[];
}
