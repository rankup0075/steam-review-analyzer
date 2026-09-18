"use client";

import type { ReviewLanguage, ReviewSort } from "@/lib/types";

export interface FormValues {
  input: string;
  language: ReviewLanguage;
  sort: ReviewSort;
  limit: number;
}

const EXAMPLES = [
  { id: "1245620", name: "ELDEN RING" },
  { id: "413150", name: "Stardew Valley" },
  { id: "730", name: "Counter-Strike 2" },
];

export function AnalyzeForm({
  values,
  onChange,
  onSubmit,
  busy,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...values, [key]: value });

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <label className="field field-main">
        <span>게임</span>
        <input
          value={values.input}
          onChange={(e) => set("input", e.target.value)}
          placeholder="스팀 상점 주소 또는 앱 ID"
          required
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>언어</span>
        <select value={values.language} onChange={(e) => set("language", e.target.value as ReviewLanguage)} disabled={busy}>
          <option value="koreana">한국어</option>
          <option value="english">영어</option>
          <option value="all">전체</option>
        </select>
      </label>
      <label className="field">
        <span>정렬</span>
        <select value={values.sort} onChange={(e) => set("sort", e.target.value as ReviewSort)} disabled={busy}>
          <option value="recent">최신순</option>
          <option value="all">도움돼요순</option>
        </select>
      </label>
      <label className="field">
        <span>리뷰 수</span>
        <select value={values.limit} onChange={(e) => set("limit", Number(e.target.value))} disabled={busy}>
          <option value={50}>50개</option>
          <option value={100}>100개</option>
          <option value={200}>200개</option>
        </select>
      </label>
      <button type="submit" className="btn-primary" disabled={busy || !values.input.trim()}>
        {busy ? "분석 중" : "분석 시작"}
      </button>

      <p className="examples">
        예시
        {EXAMPLES.map((ex) => (
          <button key={ex.id} type="button" className="chip" disabled={busy} onClick={() => set("input", ex.id)}>
            {ex.name}
          </button>
        ))}
      </p>
    </form>
  );
}
