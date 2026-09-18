import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "스팀 리뷰 분석기",
  description: "스팀 유저 리뷰를 AI로 분류하고 개발팀용 이슈 리포트로 정리합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
