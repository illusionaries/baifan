import html2canvas from 'html2canvas-pro'

/**
 * 把报表节点导出成 PNG。
 * 用 html2canvas-pro 自己绘制（而不是 SVG + foreignObject）：Chrome 会把含
 * foreignObject 的 SVG 图标记为污染源，canvas 无法再导出。
 */
const SCALE = 2
const PADDING = 24
const BACKGROUND = '#f2f0e9'
/** 固定按桌面版宽度出图，手机上导出的也是双栏排版 */
const EXPORT_WIDTH = 1320

export async function exportNodeToPng(node: HTMLElement, filename: string): Promise<void> {
  await document.fonts.ready

  const width = EXPORT_WIDTH
  const clone = node.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-export="omit"]').forEach((el) => el.remove())
  clone.style.cssText = `width:${width}px;height:auto;margin:0`

  const stage = document.createElement('div')
  stage.style.cssText = `position:absolute;left:-20000px;top:0;padding:${PADDING}px;background:${BACKGROUND};width:${width + PADDING * 2}px;box-sizing:border-box`
  stage.append(clone)
  document.body.append(stage)

  try {
    const canvas = await html2canvas(stage, {
      scale: SCALE,
      backgroundColor: BACKGROUND,
      logging: false,
      width: width + PADDING * 2,
      windowWidth: width + PADDING * 2,
    })

    const { promise: png, resolve: onEncoded } = Promise.withResolvers<Blob | null>()
    canvas.toBlob(onEncoded, 'image/png')
    const blob = await png
    if (!blob) throw new Error('PNG 编码失败')

    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
  } finally {
    stage.remove()
  }
}
