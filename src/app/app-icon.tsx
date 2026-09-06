import { ImageResponse } from "next/og";

export function appIcon(size: number) {
  return new ImageResponse(
    <svg width={size} height={size} viewBox="0 0 192 192" fill="none">
      <rect width="192" height="192" fill="#0d1216" />
      <path d="M42 138V54c0-12 15-18 23-9l31 33 31-33c8-9 23-3 23 9v84" stroke="#58cc4f" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>,
    { width: size, height: size }
  );
}
