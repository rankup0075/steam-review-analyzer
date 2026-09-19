import type { SteamReview } from "./types";

/**
 * 리뷰 작성 당시 플레이 시간 구간.
 * 2시간은 스팀 환불 기준이라 "찍먹" 구간의 경계로 의미가 있다.
 */
export const PLAYTIME_BUCKETS = [
  { id: "taste", label: "찍먹", range: "2시간 미만", min: 0, max: 2 },
  { id: "new", label: "입문", range: "2~20시간", min: 2, max: 20 },
  { id: "skilled", label: "숙련", range: "20~100시간", min: 20, max: 100 },
  { id: "veteran", label: "고인물", range: "100시간 이상", min: 100, max: Infinity },
] as const;

export type PlaytimeBucketId = (typeof PLAYTIME_BUCKETS)[number]["id"];
export type PlaytimeBucket = (typeof PLAYTIME_BUCKETS)[number];

/** 구간 판단은 작성 당시 시간 기준. 예전 결과처럼 없으면 현재 시간으로 대신한다. */
export const playtimeAtReview = (r: Pick<SteamReview, "playtimeHours" | "playtimeAtReviewHours">) =>
  r.playtimeAtReviewHours ?? r.playtimeHours;

export function bucketOf(hours: number): PlaytimeBucket {
  return PLAYTIME_BUCKETS.find((b) => hours >= b.min && hours < b.max) ?? PLAYTIME_BUCKETS[0];
}

export function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}분`;
  return `${h >= 100 ? Math.round(h) : h}시간`;
}
