/**
 * 스팀 리뷰 분석 기능: 프롬프트, 응답 스키마, 응답 검증.
 * 공통 LLM 호출(lib/llm.ts) 위에 올라가는 "기능 모듈" 하나.
 */
import { generateJson, type JsonSchema } from "./llm";
import { bucketOf, PLAYTIME_BUCKETS } from "./playtime";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SENTIMENTS,
  SEVERITIES,
  type AnalysisSummary,
  type Category,
  type ClassifiedReview,
  type GameInfo,
  type Issue,
  type Sentiment,
  type Severity,
  type SteamReview,
} from "./types";

export const CLASSIFY_BATCH_SIZE = 50;

const categoryGuide = CATEGORIES.map((c) => `- ${c}: ${CATEGORY_LABELS[c]}`).join("\n");

const enumString = (values: readonly string[]) => ({ type: "STRING", format: "enum", enum: [...values] });

/* ---------------- 1단계: 리뷰 개별 분류 ---------------- */

const CLASSIFY_SYSTEM = `너는 게임 개발사의 라이브 운영·QA 분석가다.
스팀 유저 리뷰를 하나씩 읽고 개발팀이 바로 활용할 수 있게 분류한다.

규칙:
- sentiment: 리뷰 전체의 감정. positive / negative / mixed(칭찬과 불만이 비슷하게 섞임)
- categories: 리뷰가 실제로 언급한 주제만 1~3개. 칭찬이든 불만이든 언급했으면 포함한다.
${categoryGuide}
  "갓겜", "재밌어요", "돈 아까움"처럼 구체적인 주제 없이 게임 전체를 평가하면 overall을 쓴다.
  other는 목록의 어느 주제에도 맞지 않는 구체적인 내용일 때만 쓴다.
- severity: 리뷰가 제기한 문제의 심각도.
  high = 진행 불가, 크래시, 세이브 손실, 환불·이탈을 언급할 정도의 문제
  medium = 경험을 눈에 띄게 해치는 문제
  low = 사소한 불편이나 취향 차이
  none = 문제 제기 없음
- summary: 개발자가 읽을 한국어 한 문장(40자 이내). 원문이 외국어여도 한국어로 쓴다.
- 입력된 모든 id에 대해 정확히 하나씩 결과를 반환한다.`;

const CLASSIFY_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          sentiment: enumString(SENTIMENTS),
          categories: { type: "ARRAY", items: enumString(CATEGORIES) },
          severity: enumString(SEVERITIES),
          summary: { type: "STRING" },
        },
        required: ["id", "sentiment", "categories", "severity", "summary"],
      },
    },
  },
  required: ["results"],
};

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export async function classifyReviews(reviews: SteamReview[]): Promise<ClassifiedReview[]> {
  const lines = reviews.map((r) =>
    JSON.stringify({ id: r.id, 추천: r.votedUp, 작성시플레이시간: r.playtimeAtReviewHours ?? r.playtimeHours, 내용: r.text }),
  );
  const prompt = `다음 ${reviews.length}개의 리뷰를 분류해줘.\n\n${lines.join("\n")}`;

  const raw = await generateJson<{ results?: unknown[] }>({
    system: CLASSIFY_SYSTEM,
    prompt,
    schema: CLASSIFY_SCHEMA,
  });

  // AI 응답 검증: 모르는 id는 버리고, 누락된 리뷰는 추천 여부로 기본값을 채운다
  const byId = new Map<string, ClassifiedReview>();
  for (const item of raw.results ?? []) {
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "");
    if (!id) continue;
    const categories = Array.isArray(r.categories)
      ? [...new Set(r.categories.filter((c): c is Category => isOneOf(CATEGORIES, c)))].slice(0, 3)
      : [];
    byId.set(id, {
      id,
      sentiment: isOneOf(SENTIMENTS, r.sentiment) ? (r.sentiment as Sentiment) : "mixed",
      categories: categories.length ? categories : ["overall"],
      severity: isOneOf(SEVERITIES, r.severity) ? (r.severity as Severity) : "none",
      summary: typeof r.summary === "string" ? r.summary.trim() : "",
    });
  }

  return reviews.map(
    (review) =>
      byId.get(review.id) ?? {
        id: review.id,
        sentiment: review.votedUp ? "positive" : "negative",
        categories: ["overall"],
        severity: "none",
        summary: "AI 분류 결과가 누락된 리뷰",
        unanalyzed: true,
      },
  );
}

/* ---------------- 2단계: 전체 요약 · 이슈 도출 ---------------- */

const SUMMARY_SYSTEM = `너는 게임 개발사의 라이브 운영 리드다.
분류된 스팀 리뷰 목록을 보고 개발팀 주간 회의에 올릴 리포트를 작성한다.

규칙:
- overview: 현재 유저 여론을 2~3문장으로 요약.
- playtimeInsight: 리뷰 작성 당시 플레이 시간 구간(${PLAYTIME_BUCKETS.map((b) => `${b.label} ${b.range}`).join(", ")})별로
  여론과 불만이 어떻게 다른지 1~2문장. 예: 초반 유저는 조작감, 장기 유저는 콘텐츠 부족을 지적.
  리뷰가 5건 미만인 구간은 단정하지 말고, 뚜렷한 차이가 없으면 없다고 쓴다.
- issues: 개발팀이 대응해야 할 문제를 영향도(심각도 × 언급 빈도) 순으로 최대 5개.
  같은 원인의 불만은 하나로 묶고, 근거가 된 리뷰의 id를 reviewIds에 모두 넣는다. 목록에 있는 id만 쓴다.
- strengths: 유저들이 반복해서 칭찬하는 점 최대 3개.
- recommendations: 개발팀이 다음 패치에서 할 수 있는 구체적인 행동 최대 5개.
- 모든 문장은 한국어로, 과장 없이 리뷰에 근거해서 쓴다.`;

const SUMMARY_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    overview: { type: "STRING" },
    playtimeInsight: { type: "STRING" },
    issues: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          category: enumString(CATEGORIES),
          severity: enumString(SEVERITIES.filter((s) => s !== "none")),
          description: { type: "STRING" },
          reviewIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "category", "severity", "description", "reviewIds"],
      },
    },
    strengths: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, description: { type: "STRING" } },
        required: ["title", "description"],
      },
    },
    recommendations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["overview", "playtimeInsight", "issues", "strengths", "recommendations"],
};

/** 요약 단계에 필요한 리뷰 정보 (원문은 보내지 않는다) */
export interface ReviewMeta {
  votedUp: boolean;
  /** 리뷰 작성 당시 플레이 시간 */
  playtime: number;
}

export async function summarizeReviews(
  game: Pick<GameInfo, "name">,
  classified: ClassifiedReview[],
  meta: Record<string, ReviewMeta>,
): Promise<AnalysisSummary> {
  const positive = classified.filter((c) => meta[c.id]?.votedUp).length;

  // 구간별 추천 비율은 코드로 계산해서 AI에게 사실로 알려준다
  const bucketLines = PLAYTIME_BUCKETS.map((b) => {
    const inBucket = classified.filter((c) => meta[c.id] && bucketOf(meta[c.id].playtime).id === b.id);
    const rec = inBucket.filter((c) => meta[c.id].votedUp).length;
    return `${b.label}(${b.range}): ${inBucket.length}건, 추천 ${inBucket.length ? Math.round((rec / inBucket.length) * 100) : 0}%`;
  });

  const lines = classified.map((c) => {
    const m = meta[c.id];
    return `${c.id} | ${m?.votedUp ? "추천" : "비추천"} | ${m ? bucketOf(m.playtime).label : "?"} ${m?.playtime ?? "?"}h | ${c.sentiment} | ${c.categories.join(",")} | ${c.severity} | ${c.summary}`;
  });

  const prompt = `게임: ${game.name}
분석한 리뷰 ${classified.length}건 중 추천 ${positive}건, 비추천 ${classified.length - positive}건.

작성 당시 플레이 시간 구간별:
${bucketLines.join("\n")}

형식: id | 추천여부 | 작성 당시 플레이 시간 | 감정 | 주제 | 심각도 | 요약
${lines.join("\n")}`;

  const raw = await generateJson<Partial<AnalysisSummary>>({
    system: SUMMARY_SYSTEM,
    prompt,
    schema: SUMMARY_SCHEMA,
    temperature: 0.3,
  });

  const validIds = new Set(classified.map((c) => c.id));
  const issues: Issue[] = (raw.issues ?? [])
    .map((i) => ({
      title: String(i.title ?? "").trim(),
      category: isOneOf(CATEGORIES, i.category) ? i.category : "other",
      severity: isOneOf(SEVERITIES, i.severity) ? i.severity : "medium",
      description: String(i.description ?? "").trim(),
      reviewIds: [...new Set((i.reviewIds ?? []).map(String).filter((id) => validIds.has(id)))],
    }))
    .filter((i) => i.title && i.reviewIds.length > 0)
    .slice(0, 5);

  return {
    overview: String(raw.overview ?? "").trim(),
    playtimeInsight: String(raw.playtimeInsight ?? "").trim() || undefined,
    issues,
    strengths: (raw.strengths ?? []).slice(0, 3),
    recommendations: (raw.recommendations ?? []).map(String).slice(0, 5),
  };
}
