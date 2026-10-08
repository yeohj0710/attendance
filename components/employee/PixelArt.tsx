import type { CSSProperties, ReactNode } from "react";

/**
 * 도트 그림 그리기. 글자 지도(한 글자 = 한 칸)를 SVG 사각형으로 찍는다.
 * - 같은 줄에서 같은 색이 이어지면 한 사각형으로 합쳐 요소 수를 줄인다.
 * - 프레임이 여러 장이면 CSS 애니메이션(px-show-N)으로만 넘긴다. 자바스크립트 타이머를 쓰지 않는다.
 * - 그림은 코드 안에 있어서 따로 내려받는 파일이 없다(트래픽 0).
 */
export type PixelSprite = { w: number; h: number; palette: Record<string, string>; frames: string[][] };

export function pixelRects(rows: string[], palette: Record<string, string>, keyPrefix = "", ox = 0, oy = 0) {
  const rects: ReactNode[] = [];
  rows.forEach((row, ry) => {
    let start = 0;
    while (start < row.length) {
      const ch = row[start];
      let end = start + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) {
        rects.push(<rect fill={fill} height={1} key={`${keyPrefix}${ry}-${start}`} width={end - start} x={ox + start} y={oy + ry} />);
      }
      start = end;
    }
  });
  return rects;
}

/** 프레임 i 를 보이게 하는 CSS. 한 바퀴 duration 초 */
export function frameStyle(i: number, n: number, duration: number): CSSProperties | undefined {
  if (n <= 1) return undefined;
  const delay = -(((n - i) % n) * duration) / n;
  return { animation: `px-show-${Math.min(n, 4)} ${duration}s step-end infinite`, animationDelay: `${delay}s` };
}

export function PixelSpriteView({
  sprite,
  palette,
  duration = 0.8,
  className,
  title,
}: {
  sprite: PixelSprite;
  /** 색 바꾸기 (예: 옷 색 O) */
  palette?: Record<string, string>;
  duration?: number;
  className?: string;
  title?: string;
}) {
  const pal = palette ? { ...sprite.palette, ...palette } : sprite.palette;
  const frames = sprite.frames.slice(0, 4);
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      role={title ? "img" : undefined}
      shapeRendering="crispEdges"
      viewBox={`0 0 ${sprite.w} ${sprite.h}`}
    >
      {title ? <title>{title}</title> : null}
      {frames.map((frame, i) => (
        <g key={i} style={frameStyle(i, frames.length, duration)}>
          {pixelRects(frame, pal, `f${i}-`)}
        </g>
      ))}
    </svg>
  );
}
