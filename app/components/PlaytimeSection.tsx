import type { PlaytimeStat } from "@/lib/aggregate";
import type { PlaytimeBucketId } from "@/lib/playtime";
import { CATEGORY_LABELS } from "@/lib/types";

/** 리뷰 작성 당시 플레이 시간 구간별 추천 비율과 주요 불만 */
export function PlaytimeSection({
  stats,
  insight,
  onShowReviews,
}: {
  stats: PlaytimeStat[];
  insight?: string;
  onShowReviews: (id: PlaytimeBucketId) => void;
}) {
  return (
    <div>
      {insight && <p className="pt-insight">{insight}</p>}
      <ul className="pt-grid">
        {stats.map((s) => (
          <li key={s.bucket.id} className={s.total === 0 ? "pt-card is-empty" : "pt-card"}>
            <div className="pt-head">
              <b>{s.bucket.label}</b>
              <span>{s.bucket.range}</span>
            </div>
            {s.total === 0 ? (
              <p className="pt-none">이 구간 리뷰가 없어요</p>
            ) : (
              <>
                <div className="pt-rate">
                  추천 <b>{s.recommendRate}%</b>
                  <span>리뷰 {s.total}건</span>
                </div>
                <div className="pt-bar" aria-hidden>
                  <span className="pt-bar-pos" style={{ width: `${s.recommendRate}%` }} />
                  <span className="pt-bar-neg" style={{ width: `${100 - s.recommendRate}%` }} />
                </div>
                {s.topComplaints.length > 0 ? (
                  <p className="pt-complaints">
                    주요 불만{" "}
                    {s.topComplaints.map((c) => (
                      <span key={c.category} className="tag">
                        {CATEGORY_LABELS[c.category]}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="pt-complaints">두드러진 불만이 없어요</p>
                )}
                <button type="button" className="btn-link" onClick={() => onShowReviews(s.bucket.id)}>
                  리뷰 {s.total}건 보기
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="pt-note">플레이 시간은 리뷰를 쓸 당시 기준이에요. 2시간은 스팀 환불 기준이라 찍먹 구간의 경계로 잡았어요.</p>
    </div>
  );
}
