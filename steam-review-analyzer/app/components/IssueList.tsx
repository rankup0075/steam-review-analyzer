import { CATEGORY_LABELS, SEVERITY_LABELS, type Issue, type SteamReview } from "@/lib/types";

export function IssueList({
  issues,
  reviews,
  onShowReviews,
}: {
  issues: Issue[];
  reviews: Map<string, SteamReview>;
  onShowReviews: (issue: Issue) => void;
}) {
  if (issues.length === 0) {
    return <p className="empty">두드러진 문제가 발견되지 않았어요.</p>;
  }

  return (
    <ol className="issues">
      {issues.map((issue) => {
        const sample = reviews.get(issue.reviewIds[0]);
        return (
          <li key={issue.title} className={`issue sev-${issue.severity}`}>
            <div className="issue-meta">
              <span className="sev">{SEVERITY_LABELS[issue.severity]}</span>
              <span>{CATEGORY_LABELS[issue.category]}</span>
              <span>리뷰 {issue.reviewIds.length}건</span>
            </div>
            <h3>{issue.title}</h3>
            <p>{issue.description}</p>
            {sample && (
              <blockquote>
                {sample.text.length > 160 ? `${sample.text.slice(0, 160)}…` : sample.text}
              </blockquote>
            )}
            <button type="button" className="btn-link" onClick={() => onShowReviews(issue)}>
              관련 리뷰 {issue.reviewIds.length}건 보기
            </button>
          </li>
        );
      })}
    </ol>
  );
}
