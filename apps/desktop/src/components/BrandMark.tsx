/** 品牌图标：G 形锻环 + 紫色锻锤 + 火花，与应用图标同源 */
export function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
      <path
        d="M724 262C666 208 590 176 506 176C318 176 168 326 168 512C168 698 318 848 506 848C646 848 766 766 820 652"
        stroke="currentColor"
        strokeWidth="108"
        strokeLinecap="round"
      />
      <path
        d="M512 496H848L726 618"
        stroke="#8B7DFF"
        strokeWidth="108"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M268 240l14 34 34 14-34 14-14 34-14-34-34-14 34-14z" fill="#8B7DFF" />
    </svg>
  )
}
