import type { Aggregate } from "./aggregate";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  type AnalysisSummary,
  type ClassifiedReview,
  type GameInfo,
  type SteamReview,
} from "./types";

/** Jira·노션·깃허브 이슈에 그대로 붙여넣을 수 있는 리포트 */
export function toMarkdown(
  game: GameInfo,
  stats: Aggregate,
  summary: AnalysisSummary,
  reviews: SteamReview[],
  classified: ClassifiedReview[],
) {
  const reviewById = new Map(reviews.map((r) => [r.id, r]));
  const classById = new Map(classified.map((c) => [c.id, c]));
  const date = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# ${game.name} 스팀 리뷰 분석 리포트`,
    "",
    `- 분석일: ${date}`,
    `- 분석 리뷰: ${stats.total}건 (추천 ${stats.recommended}건, ${stats.recommendRate}%)`,
    ...(game.reviewScoreDesc ? [`- 스팀 평가: ${game.reviewScoreDesc}`] : []),
    `- 스토어: https://store.steampowered.com/app/${game.appId}`,
    "",
    "## 요약",
    "",
    summary.overview,
    "",
    "## 주요 이슈",
    "",
  ];

  summary.issues.forEach((issue, i) => {
    lines.push(
      `### ${i + 1}. ${issue.title}`,
      "",
      `- 심각도: ${SEVERITY_LABELS[issue.severity]}`,
      `- 분류: ${CATEGORY_LABELS[issue.category]}`,
      `- 관련 리뷰: ${issue.reviewIds.length}건`,
      "",
      issue.description,
      "",
      "관련 리뷰 요약:",
      "",
    );
    for (const id of issue.reviewIds.slice(0, 5)) {
      const c = classById.get(id);
      const r = reviewById.get(id);
      if (c && r) lines.push(`- ${c.summary} (${r.votedUp ? "추천" : "비추천"}, ${r.playtimeHours}시간)`);
    }
    lines.push("");
  });

  lines.push("## 유저들이 좋아하는 점", "");
  for (const s of summary.strengths) lines.push(`- **${s.title}**: ${s.description}`);

  lines.push("", "## 다음 패치 제안", "");
  summary.recommendations.forEach((r) => lines.push(`- [ ] ${r}`));

  lines.push("", "## 주제별 언급 수", "", "| 주제 | 긍정 | 혼합 | 부정 | 합계 |", "| --- | ---: | ---: | ---: | ---: |");
  for (const c of stats.categories) {
    lines.push(`| ${CATEGORY_LABELS[c.category]} | ${c.positive} | ${c.mixed} | ${c.negative} | ${c.total} |`);
  }

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n") + "\n";
}
