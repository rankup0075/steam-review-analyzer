import { NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/http";
import { fetchGameInfo, fetchReviews, parseAppId, searchGames } from "@/lib/steam";
import type { ReviewLanguage, ReviewSort, SteamApiResponse } from "@/lib/types";

export const maxDuration = 30;

const MAX_REVIEWS = 200; // 공개 배포 시 무료 API 한도를 지키기 위한 상한

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = String(body.input ?? "").trim();
    if (!input) return badRequest("게임 이름, 스팀 상점 주소, 앱 ID 중 하나를 입력해 주세요.");

    // 주소나 숫자가 아니면 게임 이름으로 보고 검색 결과 1위를 쓴다
    let appId = parseAppId(input);
    if (!appId) {
      const [first] = await searchGames(input, 1);
      if (!first) return badRequest(`'${input}'(으)로 찾은 게임이 없어요. 영어 이름이나 스팀 상점 주소로 다시 입력해 보세요.`);
      appId = first.appId;
    }

    const language: ReviewLanguage = ["koreana", "english", "all"].includes(body.language) ? body.language : "koreana";
    const sort: ReviewSort = body.sort === "all" ? "all" : "recent";
    const limit = Math.min(Math.max(Number(body.limit) || 100, 10), MAX_REVIEWS);

    const [info, result] = await Promise.all([fetchGameInfo(appId), fetchReviews(appId, { language, sort, limit })]);

    const response: SteamApiResponse = {
      game: {
        appId,
        name: info?.name ?? `App ${appId}`,
        headerImage: info?.headerImage,
        reviewScoreDesc: result.reviewScoreDesc,
        totalReviews: result.totalReviews,
      },
      reviews: result.reviews,
    };
    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
