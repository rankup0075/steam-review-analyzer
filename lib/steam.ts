import type { GameInfo, ReviewLanguage, ReviewSort, SteamReview } from "./types";

const MAX_TEXT_LENGTH = 1200;

/** "1245620" 또는 "https://store.steampowered.com/app/1245620/ELDEN_RING/" → "1245620" */
export function parseAppId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

const SCORE_LABELS: Record<string, string> = {
  "Overwhelmingly Positive": "압도적으로 긍정적",
  "Very Positive": "매우 긍정적",
  Positive: "긍정적",
  "Mostly Positive": "대체로 긍정적",
  Mixed: "복합적",
  "Mostly Negative": "대체로 부정적",
  Negative: "부정적",
  "Very Negative": "매우 부정적",
  "Overwhelmingly Negative": "압도적으로 부정적",
  "No user reviews": "리뷰 없음",
};

/** 스팀 평가 문구를 한글로 ("8 user reviews"처럼 리뷰가 적을 때 나오는 문구 포함) */
export function translateScore(desc?: string) {
  if (!desc) return undefined;
  if (SCORE_LABELS[desc]) return SCORE_LABELS[desc];
  const few = desc.match(/^(\d+) user reviews?$/);
  return few ? `리뷰 ${few[1]}개` : desc;
}

/** 스팀 리뷰의 BBCode 태그 제거 */
function cleanText(text: string) {
  return text
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

export async function fetchGameInfo(appId: string): Promise<Pick<GameInfo, "name" | "headerImage"> | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=koreana`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.[appId];
    if (!entry?.success) return null;
    return { name: entry.data.name, headerImage: entry.data.header_image };
  } catch {
    return null;
  }
}

interface SteamReviewRaw {
  recommendationid: string;
  review: string;
  voted_up: boolean;
  votes_up: number;
  timestamp_created: number;
  language: string;
  author?: { playtime_forever?: number };
}

export async function fetchReviews(
  appId: string,
  opts: { language: ReviewLanguage; sort: ReviewSort; limit: number },
): Promise<{ reviews: SteamReview[]; reviewScoreDesc?: string; totalReviews?: number }> {
  const reviews: SteamReview[] = [];
  const seen = new Set<string>();
  let cursor = "*";
  let reviewScoreDesc: string | undefined;
  let totalReviews: number | undefined;

  for (let page = 0; page < 10 && reviews.length < opts.limit; page++) {
    const params = new URLSearchParams({
      json: "1",
      filter: opts.sort,
      language: opts.language,
      num_per_page: "100",
      cursor,
      purchase_type: "all",
      review_type: "all",
    });
    if (opts.sort === "all") params.set("day_range", "365");

    const res = await fetch(`https://store.steampowered.com/appreviews/${appId}?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`스팀 리뷰를 불러오지 못했어요 (HTTP ${res.status}).`);
    const data = await res.json();
    if (data?.success !== 1) throw new Error("스팀에서 이 게임의 리뷰를 찾지 못했어요. 앱 ID를 확인해 주세요.");

    if (page === 0) {
      reviewScoreDesc = translateScore(data.query_summary?.review_score_desc);
      totalReviews = data.query_summary?.total_reviews;
    }

    const batch: SteamReviewRaw[] = data.reviews ?? [];
    if (batch.length === 0) break;

    for (const r of batch) {
      if (seen.has(r.recommendationid)) continue;
      seen.add(r.recommendationid);
      const text = cleanText(r.review ?? "");
      if (!text) continue;
      reviews.push({
        id: r.recommendationid,
        text,
        votedUp: r.voted_up,
        votesUp: r.votes_up ?? 0,
        createdAt: r.timestamp_created,
        language: r.language,
        playtimeHours: Math.round(((r.author?.playtime_forever ?? 0) / 60) * 10) / 10,
      });
      if (reviews.length >= opts.limit) break;
    }

    if (!data.cursor || data.cursor === cursor) break;
    cursor = data.cursor;
  }

  return { reviews, reviewScoreDesc, totalReviews };
}

export interface GameSearchItem {
  appId: string;
  name: string;
  image?: string;
}

async function storeSearch(term: string, lang: string): Promise<GameSearchItem[]> {
  const params = new URLSearchParams({ term, l: lang, cc: "KR" });
  try {
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items: { type?: string; id: number; name: string; tiny_image?: string }[] = data?.items ?? [];
    return items
      .filter((i) => !i.type || i.type === "app")
      .map((i) => ({ appId: String(i.id), name: i.name, image: i.tiny_image }));
  } catch {
    return [];
  }
}

/** 게임 이름으로 검색. 한글 이름과 영어 이름 모두 잡히도록 두 언어로 검색해 합친다. */
export async function searchGames(term: string, limit = 8): Promise<GameSearchItem[]> {
  const q = term.trim();
  if (!q) return [];
  const [ko, en] = await Promise.all([storeSearch(q, "koreana"), storeSearch(q, "english")]);
  const seen = new Set<string>();
  const merged: GameSearchItem[] = [];
  for (const item of [...ko, ...en]) {
    if (seen.has(item.appId)) continue;
    seen.add(item.appId);
    merged.push(item);
  }
  return merged.slice(0, limit);
}
