"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReviewLanguage, ReviewSort } from "@/lib/types";

export interface FormValues {
  input: string;
  /** 검색 목록에서 게임을 고른 경우 그 게임의 앱 ID */
  appId?: string;
  language: ReviewLanguage;
  sort: ReviewSort;
  limit: number;
}

interface SearchItem {
  appId: string;
  name: string;
  image?: string;
}

const EXAMPLES = [
  { id: "1245620", name: "ELDEN RING" },
  { id: "413150", name: "Stardew Valley" },
  { id: "730", name: "Counter-Strike 2" },
];

/** 숫자나 상점 주소면 검색하지 않는다 */
const looksLikeId = (v: string) => /^\d+$/.test(v.trim()) || v.includes("store.steampowered.com");

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

  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  // 입력이 멈추고 0.3초 뒤에 검색 (게임을 이미 골랐으면 검색 안 함)
  useEffect(() => {
    const q = values.input.trim();
    if (values.appId || q.length < 2 || looksLikeId(q)) {
      setItems([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((res) => res.json())
        .then((data) => {
          setItems(data.items ?? []);
          setActive(-1);
          setSearching(false);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [values.input, values.appId]);

  // 바깥을 누르면 목록 닫기
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(item: SearchItem) {
    onChange({ ...values, input: item.name, appId: item.appId });
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && !values.appId && values.input.trim().length >= 2 && !looksLikeId(values.input);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        if (!busy) onSubmit();
      }}
    >
      <div className="field field-main" ref={wrapRef}>
        <label htmlFor="game-input">게임</label>
        <input
          id="game-input"
          value={values.input}
          onChange={(e) => {
            onChange({ ...values, input: e.target.value, appId: undefined });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="게임 이름, 스팀 상점 주소 또는 앱 ID"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          required
          disabled={busy}
        />
        {showList && (
          <ul className="suggest" id={listId} role="listbox">
            {searching && items.length === 0 && <li className="suggest-empty">찾는 중</li>}
            {!searching && items.length === 0 && (
              <li className="suggest-empty">검색 결과가 없어요. 영어 이름으로도 찾아보세요.</li>
            )}
            {items.map((item, i) => (
              <li
                key={item.appId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "suggest-item is-active" : "suggest-item"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" />
                ) : (
                  <span className="suggest-noimg" />
                )}
                <span>{item.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
          <button
            key={ex.id}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => {
              onChange({ ...values, input: ex.name, appId: ex.id });
              setOpen(false);
            }}
          >
            {ex.name}
          </button>
        ))}
      </p>
    </form>
  );
}
