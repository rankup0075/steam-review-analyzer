"use client";

import { useEffect, useMemo, useState } from "react";
import { bucketOf, formatHours, playtimeAtReview, PLAYTIME_BUCKETS, type PlaytimeBucketId } from "@/lib/playtime";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SENTIMENT_LABELS,
  SEVERITY_LABELS,
  type Category,
  type ClassifiedReview,
  type Issue,
  type Sentiment,
  type Severity,
  type SteamReview,
} from "@/lib/types";

const PAGE = 30;

type VoteFilter = "all" | "up" | "down";
type ListSort = "recent" | "playtime" | "helpful";

const SORT_LABELS: Record<ListSort, string> = {
  recent: "최신순",
  playtime: "플레이 시간 긴 순",
  helpful: "유용해요 많은 순",
};

export function ReviewList({
  reviews,
  classified,
  issueFilter,
  onClearIssue,
  bucketFilter,
  onBucketChange,
}: {
  reviews: SteamReview[];
  classified: ClassifiedReview[];
  issueFilter: Issue | null;
  onClearIssue: () => void;
  bucketFilter: PlaytimeBucketId | "";
  onBucketChange: (id: PlaytimeBucketId | "") => void;
}) {
  const [vote, setVote] = useState<VoteFilter>("all");
  const [category, setCategory] = useState<Category | "">("");
  const [sentiment, setSentiment] = useState<Sentiment | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [sort, setSort] = useState<ListSort>("recent");
  const [shown, setShown] = useState(PAGE);

  // 필터가 바뀌면 다시 처음 30건부터
  useEffect(() => setShown(PAGE), [vote, category, sentiment, severity, sort, bucketFilter, issueFilter]);

  const byId = useMemo(() => new Map(classified.map((c) => [c.id, c])), [classified]);

  // 추천/비추천 개수는 다른 필터(주제·감정 등)를 적용한 상태에서 센다
  const { rows, counts } = useMemo(() => {
    const issueIds = issueFilter ? new Set(issueFilter.reviewIds) : null;
    const base = reviews
      .map((r) => ({ review: r, c: byId.get(r.id) }))
      .filter((row): row is { review: SteamReview; c: ClassifiedReview } => !!row.c)
      .filter(({ review, c }) => {
        if (issueIds && !issueIds.has(review.id)) return false;
        if (bucketFilter && bucketOf(playtimeAtReview(review)).id !== bucketFilter) return false;
        if (category && !c.categories.includes(category)) return false;
        if (sentiment && c.sentiment !== sentiment) return false;
        if (severity && c.severity !== severity) return false;
        return true;
      });

    const counts = {
      all: base.length,
      up: base.filter((r) => r.review.votedUp).length,
      down: base.filter((r) => !r.review.votedUp).length,
    };

    const filtered = base.filter(({ review }) => (vote === "all" ? true : vote === "up" ? review.votedUp : !review.votedUp));
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "playtime") return playtimeAtReview(b.review) - playtimeAtReview(a.review);
      if (sort === "helpful") return b.review.votesUp - a.review.votesUp;
      return b.review.createdAt - a.review.createdAt;
    });
    return { rows: sorted, counts };
  }, [reviews, byId, issueFilter, bucketFilter, category, sentiment, severity, vote, sort]);

  return (
    <div>
      <div className="vote-tabs" role="group" aria-label="추천 여부">
        {(
          [
            ["all", "전체"],
            ["up", "추천"],
            ["down", "비추천"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={vote === key ? `vote-tab is-on vote-tab-${key}` : `vote-tab vote-tab-${key}`}
            aria-pressed={vote === key}
            onClick={() => setVote(key)}
          >
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        {issueFilter && (
          <button type="button" className="chip chip-active" onClick={onClearIssue}>
            이슈: {issueFilter.title} <span aria-hidden>✕</span>
            <span className="sr-only">필터 해제</span>
          </button>
        )}
        <select
          aria-label="작성 당시 플레이 시간"
          value={bucketFilter}
          onChange={(e) => onBucketChange(e.target.value as PlaytimeBucketId | "")}
        >
          <option value="">모든 플레이 시간</option>
          {PLAYTIME_BUCKETS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} ({b.range})
            </option>
          ))}
        </select>
        <select aria-label="주제" value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
          <option value="">모든 주제</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select aria-label="감정" value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment | "")}>
          <option value="">모든 감정</option>
          {(Object.keys(SENTIMENT_LABELS) as Sentiment[]).map((s) => (
            <option key={s} value={s}>{SENTIMENT_LABELS[s]}</option>
          ))}
        </select>
        <select aria-label="심각도" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")}>
          <option value="">모든 심각도</option>
          {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </select>
        <select aria-label="목록 정렬" value={sort} onChange={(e) => setSort(e.target.value as ListSort)} className="sort-select">
          {(Object.keys(SORT_LABELS) as ListSort[]).map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
        <span className="count">{rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">조건에 맞는 리뷰가 없어요. 필터를 바꿔 보세요.</p>
      ) : (
        <ul className="reviews">
          {rows.slice(0, shown).map(({ review, c }) => {
            const atReview = review.playtimeAtReviewHours;
            const bucket = bucketOf(playtimeAtReview(review));
            return (
              <li key={review.id} className="review">
                <div className="review-head">
                  <span className={review.votedUp ? "vote vote-up" : "vote vote-down"}>
                    {review.votedUp ? "추천" : "비추천"}
                  </span>
                  <span className={`sent sent-${c.sentiment}`}>{SENTIMENT_LABELS[c.sentiment]}</span>
                  {c.severity !== "none" && (
                    <span className={`sev-tag sev-${c.severity}`}>{SEVERITY_LABELS[c.severity]}</span>
                  )}
                  <span className="pt-tag">{bucket.label}</span>
                  {atReview != null ? (
                    <>
                      <span className="muted">작성 당시 {formatHours(atReview)}</span>
                      <span className="muted">현재 {formatHours(review.playtimeHours)}</span>
                    </>
                  ) : (
                    <span className="muted">{formatHours(review.playtimeHours)} 플레이</span>
                  )}
                  {review.votesUp > 0 && <span className="muted">유용해요 {review.votesUp}</span>}
                </div>
                <p className="review-summary">{c.summary}</p>
                <div className="tags">
                  {c.categories.map((cat) => (
                    <span key={cat} className="tag">{CATEGORY_LABELS[cat]}</span>
                  ))}
                </div>
                <details>
                  <summary>원문 보기</summary>
                  <p className="review-text">{review.text}</p>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > shown && (
        <button type="button" className="btn-secondary more" onClick={() => setShown((n) => n + PAGE)}>
          {Math.min(PAGE, rows.length - shown)}건 더 보기
        </button>
      )}
    </div>
  );
}
