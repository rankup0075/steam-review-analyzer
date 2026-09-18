"use client";

import { useMemo, useState } from "react";
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

export function ReviewList({
  reviews,
  classified,
  issueFilter,
  onClearIssue,
}: {
  reviews: SteamReview[];
  classified: ClassifiedReview[];
  issueFilter: Issue | null;
  onClearIssue: () => void;
}) {
  const [category, setCategory] = useState<Category | "">("");
  const [sentiment, setSentiment] = useState<Sentiment | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const byId = new Map(classified.map((c) => [c.id, c]));
    const issueIds = issueFilter ? new Set(issueFilter.reviewIds) : null;
    return reviews
      .map((r) => ({ review: r, c: byId.get(r.id) }))
      .filter((row): row is { review: SteamReview; c: ClassifiedReview } => !!row.c)
      .filter(({ review, c }) => {
        if (issueIds && !issueIds.has(review.id)) return false;
        if (category && !c.categories.includes(category)) return false;
        if (sentiment && c.sentiment !== sentiment) return false;
        if (severity && c.severity !== severity) return false;
        return true;
      });
  }, [reviews, classified, issueFilter, category, sentiment, severity]);

  return (
    <div>
      <div className="filters">
        {issueFilter && (
          <button type="button" className="chip chip-active" onClick={onClearIssue}>
            이슈: {issueFilter.title} <span aria-hidden>✕</span>
            <span className="sr-only">필터 해제</span>
          </button>
        )}
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
        <span className="count">{rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">조건에 맞는 리뷰가 없어요. 필터를 바꿔 보세요.</p>
      ) : (
        <ul className="reviews">
          {rows.slice(0, shown).map(({ review, c }) => (
            <li key={review.id} className="review">
              <div className="review-head">
                <span className={review.votedUp ? "vote vote-up" : "vote vote-down"}>
                  {review.votedUp ? "추천" : "비추천"}
                </span>
                <span className={`sent sent-${c.sentiment}`}>{SENTIMENT_LABELS[c.sentiment]}</span>
                {c.severity !== "none" && <span className={`sev-tag sev-${c.severity}`}>{SEVERITY_LABELS[c.severity]}</span>}
                <span className="muted">{review.playtimeHours}시간 플레이</span>
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
          ))}
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
