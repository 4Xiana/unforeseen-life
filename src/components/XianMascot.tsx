interface MascotProps {
  size?: number;
  variant?: 'full' | 'face';
}

// 吱呀：一片会动的小叶子（GIF 动效），举着一朵小花招手。
// hello.gif 自带 1-bit 透明背景，无需 mix-blend；GIF 原生循环、全平台可播。
// 注意 GIF 无半透明抗锯齿，叶子边缘有浅色毛边，小尺寸（58px 及以下）下不明显。
export function XianMascot({ size = 160, variant: _variant = 'full' }: MascotProps) {
  return (
    <img
      src="/hello.gif"
      width={size}
      height={size}
      alt="吱呀"
      draggable={false}
      className="rounded-full object-cover shrink-0 pointer-events-none select-none"
      style={{ width: size, height: size }}
    />
  );
}
