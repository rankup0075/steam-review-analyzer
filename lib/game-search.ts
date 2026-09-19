/**
 * 게임 이름 검색. 세 가지를 합친다.
 * 1) 한글 별칭 사전: '델', 'ㄷㅌ', '배그'처럼 한 글자·초성·줄임말로도 즉시 찾음 (AI 안 씀)
 * 2) 스팀 검색: 한글 이름이 등록된 게임, 영어 검색
 * 3) AI: 위 둘로 못 찾은 한글 검색어만 영어 원제를 추측해 다시 검색
 *    (AI가 찾은 결과는 서버가 켜져 있는 동안 사전에 추가돼 다음부터는 AI 없이 찾음)
 */
import { HANGUL_ANY, HANGUL_SYLLABLE, matchScore, normalize } from "./hangul";
import { KOREAN_ALIASES, type KoreanAlias } from "./korean-aliases";
import { generateJson } from "./llm";
import { searchGames, type GameSearchItem } from "./steam";

/** 결과가 이보다 적으면 AI 번역을 시도 */
const MIN_RESULTS = 3;
/** 사전에서 한 번에 가져올 최대 게임 수 (게임마다 스팀 검색을 한 번씩 하므로 적게) */
const MAX_ALIAS_MATCHES = 5;

export interface GameSearchResult {
  items: GameSearchItem[];
  /** AI가 추측한 영어 제목 (번역 검색을 했을 때만) */
  translatedTo?: string[];
}

// AI가 알아낸 별칭 (서버가 켜져 있는 동안만 유지)
const learnedAliases: KoreanAlias[] = [];
const translationCache = new Map<string, string[]>();
const CACHE_LIMIT = 500;

function matchAliases(query: string): KoreanAlias[] {
  const scored: { alias: KoreanAlias; score: number; order: number }[] = [];
  [...KOREAN_ALIASES, ...learnedAliases].forEach((alias, order) => {
    const scores = alias.ko.map((name) => matchScore(query, name)).filter((s): s is number => s !== null);
    if (scores.length) scored.push({ alias, score: Math.min(...scores), order });
  });
  // 점수가 같으면 사전 순서(대체로 인기 순) 유지
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, MAX_ALIAS_MATCHES).map((s) => s.alias);
}

async function guessEnglishTitles(term: string): Promise<string[]> {
  const key = normalize(term);
  const cached = translationCache.get(key);
  if (cached) return cached;

  let titles: string[] = [];
  try {
    const res = await generateJson<{ titles?: unknown[] }>({
      system: `사용자가 스팀에서 게임을 찾으려고 한국어로 입력한 검색어를 받는다.
그 게임의 스팀 상점 영어 원제를 추측해서 가능성 높은 순서로 최대 3개 돌려준다.
- 영어 제목을 한글 발음으로 적은 경우: "델타 포스" → "Delta Force"
- 줄임말·별명: "배그" → "PUBG: BATTLEGROUNDS"
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
      .filter((t) => t && !HANGUL_ANY.test(t))
      .slice(0, 3);
  } catch {
    return []; // AI가 실패해도 검색 자체는 계속 동작
  }

  if (translationCache.size >= CACHE_LIMIT) translationCache.clear();
  translationCache.set(key, titles);
  return titles;
}

function dedupe(items: GameSearchItem[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.appId)) return false;
    seen.add(i.appId);
    return true;
  });
}

export async function findGames(term: string, limit = 8): Promise<GameSearchResult> {
  const q = term.trim();
  if (!q) return { items: [] };

  const aliases = HANGUL_ANY.test(q) ? matchAliases(q) : [];
  // 'ㄷ'처럼 자음·모음만 있으면 스팀은 못 찾으니 사전만 쓴다
  const hasSyllable = !HANGUL_ANY.test(q) || HANGUL_SYLLABLE.test(q);

  const [fromAliases, direct] = await Promise.all([
    Promise.all(aliases.map((a) => searchGames(a.en, 1))).then((r) => r.flat()),
    hasSyllable ? searchGames(q, 8) : Promise.resolve([]),
  ]);

  // 한국어 사용자가 찾는 건 사전 결과일 가능성이 높아서 앞에 둔다
  const merged = dedupe([...fromAliases, ...direct]);

  // AI는 사전에 없는 한글 두 글자 이상 검색어인데 결과가 부족할 때만
  // (사전에서 찾았으면 이미 뭘 찾는지 아는 것이고, 한 글자는 추측이 부정확해서 사용량만 씀)
  const syllables = (q.match(/[가-힣]/g) ?? []).length;
  if (aliases.length > 0 || syllables < 2 || merged.length >= MIN_RESULTS) {
    return { items: merged.slice(0, limit) };
  }

  const titles = await guessEnglishTitles(q);
  if (titles.length === 0) return { items: merged.slice(0, limit) };

  const translated = (await Promise.all(titles.map((t) => searchGames(t, 4)))).flat();
  if (translated.length > 0 && !learnedAliases.some((a) => a.en === titles[0]) && learnedAliases.length < 300) {
    learnedAliases.push({ ko: [q], en: titles[0] });
  }

  return { items: dedupe([...fromAliases, ...translated, ...direct]).slice(0, limit), translatedTo: titles };
}
