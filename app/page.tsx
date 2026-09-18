"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aggregate } from "@/lib/aggregate";
import { toMarkdown } from "@/lib/markdown";
import type { AnalysisSummary, ClassifiedReview, Issue, SteamApiResponse, SteamReview } from "@/lib/types";
import { AnalyzeForm, type FormValues } from "./components/AnalyzeForm";
import { IssueList } from "./components/IssueList";
import { ReviewList } from "./components/ReviewList";
import { SentimentChart } from "./components/SentimentChart";

const BATCH_SIZE = 50; // lib/review-analysis.ts의 CLASSIFY_BATCH_SIZE와 같게 유지

type Phase =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "classifying"; done: number; total: number }
  | { kind: "summarizing" }
  | { kind: "error"; message: string }
  | { kind: "done" };

interface Result {
  data: SteamApiResponse;
  classified: ClassifiedReview[];
  summary: AnalysisSummary;
  /** 분석한 시각 (ISO 문자열) */
  savedAt: string;
}

/** public/sample-result.json 이 있으면 첫 화면에 예시 결과 버튼을 보여준다 */
const SAMPLE_URL = "/sample-result.json";

function isResult(v: unknown): v is Result {
  const r = v as Result;
  return !!r && Array.isArray(r.data?.reviews) && Array.isArray(r.classified) && typeof r.summary?.overview === "string";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `요청에 실패했어요 (HTTP ${res.status}).`);
  return json as T;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function Home() {
  const [form, setForm] = useState<FormValues>({ input: "", language: "koreana", sort: "recent", limit: 100 });
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [result, setResult] = useState<Result | null>(null);
  const [sample, setSample] = useState<Result | null>(null);
  const [showingSample, setShowingSample] = useState(false);

  // 예시 결과 파일이 있으면 미리 불러둔다 (없으면 버튼을 숨김)
  useEffect(() => {
    fetch(SAMPLE_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isResult(json)) setSample(json);
      })
      .catch(() => {});
  }, []);

  function openSample() {
    if (!sample) return;
    setIssueFilter(null);
    setResult(sample);
    setShowingSample(true);
    setPhase({ kind: "done" });
  }
  const [issueFilter, setIssueFilter] = useState<Issue | null>(null);
  const reviewsRef = useRef<HTMLElement>(null);

  const busy = phase.kind === "fetching" || phase.kind === "classifying" || phase.kind === "summarizing";

  async function run() {
    setIssueFilter(null);
    try {
      // 1) 스팀 리뷰 수집
      setPhase({ kind: "fetching" });
      const data = await postJson<SteamApiResponse>("/api/steam", {
        ...form,
        input: form.appId ?? form.input, // 목록에서 고른 게임이면 앱 ID로 정확하게
      });
      if (data.reviews.length === 0) {
        throw new Error("조건에 맞는 리뷰가 없어요. 언어를 '전체'로 바꾸거나 다른 게임을 입력해 보세요.");
      }

      // 2) 50개씩 나눠서 AI 분류 (요청마다 짧게 끝나서 무료 서버 시간 제한에 안 걸림)
      const batches = chunk(data.reviews, BATCH_SIZE);
      const classified: ClassifiedReview[] = [];
      for (let i = 0; i < batches.length; i++) {
        setPhase({ kind: "classifying", done: i, total: batches.length });
        const { results } = await postJson<{ results: ClassifiedReview[] }>("/api/analyze/classify", {
          reviews: batches[i],
        });
        classified.push(...results);
      }

      // 3) 전체 요약과 이슈 도출
      setPhase({ kind: "summarizing" });
      const votes = Object.fromEntries(data.reviews.map((r) => [r.id, r.votedUp]));
      const summary = await postJson<AnalysisSummary>("/api/analyze/summary", {
        gameName: data.game.name,
        classified,
        votes,
      });

      setResult({ data, classified, summary, savedAt: new Date().toISOString() });
      setShowingSample(false);
      setPhase({ kind: "done" });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요." });
    }
  }

  const stats = useMemo(
    () => (result ? aggregate(result.data.reviews, result.classified) : null),
    [result],
  );
  const reviewMap = useMemo(
    () => new Map<string, SteamReview>((result?.data.reviews ?? []).map((r) => [r.id, r])),
    [result],
  );

  function downloadMarkdown() {
    if (!result || !stats) return;
    const md = toMarkdown(result.data.game, stats, result.summary, result.data.reviews, result.classified);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFileName(result.data.game.name)}_리뷰분석.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** 분석 결과를 그대로 JSON으로 저장 (예시 결과로 쓰거나 나중에 다시 보기용) */
  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFileName(result.data.game.name)}_분석결과.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function showIssueReviews(issue: Issue) {
    setIssueFilter(issue);
    reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="page">
      <header className="top">
        <h1>스팀 리뷰 분석기</h1>
        <p className="lede">스팀 리뷰를 AI가 주제·감정·심각도별로 분류하고, 개발팀이 바로 쓸 수 있는 이슈 리포트로 정리해요.</p>
        <AnalyzeForm values={form} onChange={setForm} onSubmit={run} busy={busy} />
      </header>

      {busy && <ProgressView phase={phase} />}

      {phase.kind === "error" && (
        <div className="notice notice-error" role="alert">
          <strong>분석하지 못했어요.</strong> {phase.message}
        </div>
      )}

      {phase.kind === "idle" && !result && (
        <section className="intro">
          <h2>이렇게 동작해요</h2>
          <ol className="steps">
            <li>스팀에서 최신 리뷰를 최대 200개까지 가져와요.</li>
            <li>AI가 리뷰마다 주제, 감정, 문제의 심각도를 매기고 한 줄로 요약해요.</li>
            <li>비슷한 불만을 묶어 우선순위가 높은 이슈와 다음 패치 제안을 뽑아요.</li>
          </ol>
          {sample && (
            <div className="sample-cta">
              <button type="button" className="btn-primary" onClick={openSample}>
                예시 결과 보기
              </button>
              <span>
                {sample.data.game.name} 리뷰 {sample.data.reviews.length}건을 미리 분석해 둔 결과예요. 기다리지 않고 바로 볼 수 있어요.
              </span>
            </div>
          )}
        </section>
      )}

      {result && stats && !busy && (
        <div className="results">
          {showingSample && (
            <div className="notice notice-info">
              {formatDate(result.savedAt)}에 미리 분석해 둔 예시 결과예요. 최신 리뷰로 분석하려면 위에서 게임을 입력하고 분석을 시작하세요.
            </div>
          )}
          <section className={result.data.game.headerImage ? "game has-img" : "game"}>
            {result.data.game.headerImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.data.game.headerImage} alt="" className="game-img" />
            )}
            <div className="game-text">
              <h2>{result.data.game.name}</h2>
              <p className="game-stats">
                <span>
                  분석한 리뷰 <b>{stats.total}</b>건
                </span>
                <span>
                  추천 비율 <b>{stats.recommendRate}%</b>
                </span>
                {result.data.game.reviewScoreDesc && (
                  <span>
                    스팀 평가 <b>{result.data.game.reviewScoreDesc}</b>
                  </span>
                )}
                <span>
                  심각한 문제 제기 <b>{stats.severity.high}</b>건
                </span>
              </p>
              <p className="overview">{result.summary.overview}</p>
              <div className="actions">
                <button type="button" className="btn-secondary" onClick={downloadMarkdown}>
                  리포트 내려받기 (.md)
                </button>
                <button type="button" className="btn-secondary" onClick={downloadJson}>
                  결과 저장 (.json)
                </button>
              </div>
            </div>
          </section>

          {stats.unanalyzed > 0 && (
            <div className="notice">
              리뷰 {stats.unanalyzed}건은 AI 분류 결과가 누락돼 추천 여부로만 표시했어요.
            </div>
          )}

          <section className="block">
            <h2>주제별 여론</h2>
            <SentimentChart stats={stats.categories} />
          </section>

          <div className="split">
            <section className="block">
              <h2>먼저 봐야 할 이슈</h2>
              <IssueList issues={result.summary.issues} reviews={reviewMap} onShowReviews={showIssueReviews} />
            </section>
            <aside className="block aside">
              <h2>유저들이 좋아하는 점</h2>
              <ul className="plain">
                {result.summary.strengths.map((s) => (
                  <li key={s.title}>
                    <b>{s.title}</b>
                    <span>{s.description}</span>
                  </li>
                ))}
              </ul>
              <h2>다음 패치 제안</h2>
              <ul className="checklist">
                {result.summary.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </aside>
          </div>

          <section className="block" ref={reviewsRef}>
            <h2>리뷰 목록</h2>
            <ReviewList
              reviews={result.data.reviews}
              classified={result.classified}
              issueFilter={issueFilter}
              onClearIssue={() => setIssueFilter(null)}
            />
          </section>
        </div>
      )}

      <footer className="foot">
        리뷰 데이터는 Steam 공개 API, 분석은 Google Gemini를 사용해요.
      </footer>
    </main>
  );
}

function ProgressView({ phase }: { phase: Phase }) {
  let label = "";
  let ratio = 0;
  if (phase.kind === "fetching") {
    label = "스팀에서 리뷰를 가져오는 중";
    ratio = 0.05;
  } else if (phase.kind === "classifying") {
    label = `리뷰 분류 중 (${phase.done + 1}/${phase.total} 묶음)`;
    ratio = 0.1 + 0.75 * (phase.done / phase.total);
  } else if (phase.kind === "summarizing") {
    label = "이슈를 묶고 리포트를 쓰는 중";
    ratio = 0.9;
  }
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p>{label}</p>
    </div>
  );
}
