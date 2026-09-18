import type { CategoryStat } from "@/lib/aggregate";
import { CATEGORY_LABELS } from "@/lib/types";

/** 주제별 긍정(왼쪽) / 부정·혼합(오른쪽) 발산형 막대 차트 */
export function SentimentChart({ stats }: { stats: CategoryStat[] }) {
  const max = Math.max(1, ...stats.map((s) => Math.max(s.positive, s.negative + s.mixed)));
  // 숫자 라벨 자리를 남기기 위해 최대 85%까지만 채운다
  const pct = (n: number) => `${(n / max) * 85}%`;

  return (
    <figure className="diverge">
      <div className="diverge-legend" aria-hidden>
        <span><i className="sw sw-pos" />긍정</span>
        <span><i className="sw sw-mixed" />혼합</span>
        <span><i className="sw sw-neg" />부정</span>
      </div>
      <div className="diverge-head" aria-hidden>
        <span>칭찬이 많은 쪽</span>
        <span />
        <span>불만이 많은 쪽</span>
      </div>
      <ul>
        {stats.map((s) => (
          <li
            key={s.category}
            className="diverge-row"
            aria-label={`${CATEGORY_LABELS[s.category]}: 긍정 ${s.positive}, 혼합 ${s.mixed}, 부정 ${s.negative}`}
          >
            <div className="side side-pos">
              {s.positive > 0 && <span className="num">{s.positive}</span>}
              <span className="bar bar-pos" style={{ width: pct(s.positive) }} />
            </div>
            <div className="diverge-label">{CATEGORY_LABELS[s.category]}</div>
            <div className="side side-neg">
              <span className="bar bar-neg" style={{ width: pct(s.negative) }} />
              <span className="bar bar-mixed" style={{ width: pct(s.mixed) }} />
              {s.negative + s.mixed > 0 && <span className="num">{s.negative + s.mixed}</span>}
            </div>
          </li>
        ))}
      </ul>
      <figcaption>숫자는 해당 주제를 언급한 리뷰 수예요. 리뷰 하나가 여러 주제를 언급할 수 있어요.</figcaption>
    </figure>
  );
}
