import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 동적 API 라우트는 요청 시 ../memory 파일을 읽는다. serverless 함수 번들에
  // 해당 파일이 포함되도록 트레이싱 루트를 저장소 루트로 올리고 명시적으로 포함시킨다.
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/search": ["../memory/thoughts/**/*", "../memory/embeddings.json"],
    "/api/ask": ["../memory/thoughts/**/*", "../memory/embeddings.json"],
  },
};

export default nextConfig;
