import fs from "node:fs";
import path from "node:path";

// memory/ 는 앱(web/) 바깥의 저장소 루트에 있다.
// 로컬·persistent 서버는 cwd=web 이라 ../memory 로 잡히지만, Vercel serverless 는
// cwd 가 달라질 수 있어 후보 경로를 순서대로 확인한다.
// (런타임에 실제 파일이 번들에 들어가는 건 next.config 의 outputFileTracingIncludes 가 보장.)
let cached: string | null = null;

export function memoryRoot(): string {
  if (cached) return cached;
  const candidates = [
    path.resolve(process.cwd(), "..", "memory"),
    path.resolve(process.cwd(), "memory"),
  ];
  cached = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  return cached;
}
