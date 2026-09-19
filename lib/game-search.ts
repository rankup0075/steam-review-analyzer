/**
 * 게임 이름 검색.
 * 1) 스팀 검색을 먼저 하고
 * 2) 한글로 검색했는데 결과가 거의 없으면 AI로 영어 원제를 추측해 다시 검색한다.
 *    (예: "델타 포스" → "Delta Force", "배그" → "PUBG: BATTLEGROUNDS")
 */
import { generateJson } from "./llm";
import { searchGames, type GameSearchItem } from "./steam";

const HANGUL = /[가-힣]/;
/** 한글 검색 결과가 이보다 적으면 AI 번역을 시도 */
const MIN_RESULTS = 3;

export interface GameSearchResult {
  items: GameSearchItem[];
  /** AI가 추측한 영어 제목 (번역 검색을 했을 때만) */
  translatedTo?: string[];
}

// 같은 검색어로 AI를 반복 호출하지 않도록 서버 메모리에 기억 (서버가 켜져 있는 동안만 유지)
const translationCache = new Map<string, string[]>();
const CACHE_LIMIT = 500;

async function guessEnglishTitles(term: string): Promise<string[]> {
  const key = term.toLowerCase().replace(/\s+/g, " ");
  const cached = translationCache.get(key);
  if (cached) return cached;

  let titles: string[] = [];
  try {
    const res = await generateJson<{ titles?: unknown[] }>({
      system: `사용자가 스팀에서 게임을 찾으려고 한국어로 입력한 검색어를 받는다.
그 게임의 스팀 상점 영어 원제를 추측해서 가능성 높은 순서로 최대 3개 돌려준다.
- 영어 제목을 한글 발음으로 적은 경우: "델타 포스" → "Delta Force"
- 줄임말·별명: "배그" → "PUBG: BATTLEGROUNDS", "롤" → 스팀에 없으면 빼기
- 한국어 정식 명칭: "문명 6" → "Sid Meier's Civilization VI"
- 확실하지 않으면 빈 목록을 돌려준다. 지어내지 않는다.`,
      prompt: term,
      schema: {
        type: "OBJECT",
        properties: { titles: { type: "ARRAY", items: { type: "STRING" } } },
        required: ["titles"],
      },
      temperature: 0,
      timeoutMs: 8000, // 자동완성은 빨라야 해서 짧게
      attemptsPerModel: 1,
    });
    titles = (res.titles ?? [])
      .map((t) => String(t).trim())
      .filter((t) => t && !HANGUL.test(t))
      .slice(0, 3);
  } catch {
    return []; // AI가 실패해도 검색 자체는 계속 동작
  }

  if (translationCache.size >= CACHE_LIMIT) translationCache.clear();
  translationCache.set(key, titles);
  return titles;
}

export async function findGames(term: string, limit = 8): Promise<GameSearchResult> {
  const q = term.trim();
  // 결과 개수 판단은 limit과 상관없이 넉넉히 받아서 한다
  const direct = await searchGames(q, 8);
  if (!HANGUL.test(q) || direct.length >= MIN_RESULTS) return { items: direct.slice(0, limit) };

  const titles = await guessEnglishTitles(q);
  if (titles.length === 0) return { items: direct.slice(0, limit) };

  const translated = (await Promise.all(titles.map((t) => searchGames(t, 4)))).flat();

  // AI가 찾은 결과를 앞에, 원래 결과를 뒤에 두고 중복 제거
  const seen = new Set<string>();
  const items = [...translated, ...direct].filter((i) => !seen.has(i.appId) && seen.add(i.appId)).slice(0, limit);
  return { items, translatedTo: titles };
}
