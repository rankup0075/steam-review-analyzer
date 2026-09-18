import { NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/http";
import { fetchGameInfo, fetchReviews, parseAppId } from "@/lib/steam";
import type { ReviewLanguage, ReviewSort, SteamApiResponse } from "@/lib/types";

export const maxDuration = 30;

const MAX_REVIEWS = 200; // 공개 배포 시 무료 API 한도를 지키기 위한 상한

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const appId = parseAppId(String(body.input ?? ""));
    if (!appId) return badRequest("스팀 상점 주소나 앱 ID(숫자)를 입력해 주세요.");

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
