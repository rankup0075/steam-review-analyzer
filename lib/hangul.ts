/**
 * 한글 검색 유틸.
 * 글자를 자음·모음 단위로 쪼개서 비교하면 입력 중인 상태('데'→'델')나 초성('ㄷㅌ')으로도 찾을 수 있다.
 */

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅗㅏ", "ㅗㅐ", "ㅗㅣ", "ㅛ", "ㅜ",
  "ㅜㅓ", "ㅜㅔ", "ㅜㅣ", "ㅠ", "ㅡ", "ㅡㅣ", "ㅣ",
];
const JONG = [
  "", "ㄱ", "ㄲ", "ㄱㅅ", "ㄴ", "ㄴㅈ", "ㄴㅎ", "ㄷ", "ㄹ", "ㄹㄱ", "ㄹㅁ", "ㄹㅂ", "ㄹㅅ", "ㄹㅌ",
  "ㄹㅍ", "ㄹㅎ", "ㅁ", "ㅂ", "ㅂㅅ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
/** 입력기가 따로 보여주는 겹모음·겹받침 낱자도 쪼갠다 */
const COMPAT: Record<string, string> = {
  ㅘ: "ㅗㅏ", ㅙ: "ㅗㅐ", ㅚ: "ㅗㅣ", ㅝ: "ㅜㅓ", ㅞ: "ㅜㅔ", ㅟ: "ㅜㅣ", ㅢ: "ㅡㅣ",
  ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ", ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ", ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ",
  ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ", ㅄ: "ㅂㅅ",
};

export const HANGUL_SYLLABLE = /[가-힣]/;
export const HANGUL_ANY = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const ONLY_CONSONANTS = /^[ㄱ-ㅎ]+$/;

/** 공백·기호 제거, 소문자화 */
export function normalize(s: string) {
  return s.toLowerCase().replace(/[\s\-_:.,'’!?·]/g, "");
}

/** "델타" → "ㄷㅔㄹㅌㅏ" */
export function toJamo(s: string) {
  let out = "";
  for (const ch of normalize(s)) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
    } else {
      out += COMPAT[ch] ?? ch;
    }
  }
  return out;
}

/** "델타 포스" → "ㄷㅌㅍㅅ" */
export function toChoseong(s: string) {
  let out = "";
  for (const ch of normalize(s)) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out;
}

/**
 * 검색어가 이름과 얼마나 잘 맞는지. 작을수록 좋고, 안 맞으면 null.
 * 0: 앞부분 일치 / 1: 단어 앞부분·초성 일치 / 2: 중간 포함
 */
export function matchScore(query: string, name: string): number | null {
  const q = toJamo(query);
  if (!q) return null;
  const n = toJamo(name);
  if (n.startsWith(q)) return 0;
  if (name.split(/\s+/).some((w) => toJamo(w).startsWith(q))) return 1;
  const nq = normalize(query);
  if (ONLY_CONSONANTS.test(nq) && nq.length >= 2 && toChoseong(name).startsWith(nq)) return 1;
  if (q.length >= 4 && n.includes(q)) return 2; // 너무 짧은 중간 일치는 잡음이 많아서 제외
  return null;
}
