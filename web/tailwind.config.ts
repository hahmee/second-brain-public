import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 어두운 톤 + 앰버 액센트 (careerhackeralex 스타일)
        ink: {
          950: "#0a0a0b",
          900: "#101013",
          800: "#16161a",
          700: "#1f1f24",
          600: "#2a2a32",
        },
        accent: {
          DEFAULT: "#e8b339", // muted amber
          dim: "#a07d2a",
        },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "ui-sans-serif", "system-ui", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
        display: ["Pretendard Variable", "Pretendard", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "7px",
        lg: "10px",
      },
    },
  },
  plugins: [],
} satisfies Config;
