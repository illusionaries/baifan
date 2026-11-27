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

/**
 * 把 <svg> 换成自带样式的 <img>。
 *
 * html2canvas 自己序列化 <svg> 时会丢外部样式（`fill: var(--ink)` 之类直接变黑）
 * 并算错盒子；这里手动内联计算样式、按实测尺寸出图，交给它当普通图片贴。
 */
const SVG_INLINE_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
]

async function rasterizeSvgs(root: HTMLElement): Promise<void> {
  const svgs = [...root.querySelectorAll('svg')]
  await Promise.all(
    svgs.map(async (svg) => {
      const rect = svg.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return

      const copy = svg.cloneNode(true) as SVGSVGElement
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      copy.setAttribute('width', String(rect.width))
      copy.setAttribute('height', String(rect.height))

      const src = [svg, ...svg.querySelectorAll('*')]
      const dst = [copy, ...copy.querySelectorAll('*')]
      src.forEach((node, i) => {
        const target = dst[i]
        if (!target) return
        const cs = getComputedStyle(node)
        target.setAttribute('style', SVG_INLINE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'))
      })

      const img = document.createElement('img')
      for (const { name, value } of [...svg.attributes]) {
        if (name === 'viewBox' || name === 'preserveAspectRatio' || name === 'aria-hidden') continue
        img.setAttribute(name, value)
      }
      // object-fit 必须是 fill：html2canvas 对 replaced element 默认按图片原始尺寸贴图，
      // 而这里量到的尺寸属于「手机视口下的单栏布局」，比导出的双栏盒子宽得多
      img.style.cssText = 'display:block;width:100%;height:100%;object-fit:fill;flex:1;min-height:0'
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
      await img.decode().catch(() => undefined)
      svg.replaceWith(img)
    }),
  )
}

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
    // 等克隆节点在 stage 里完成布局，再按实测盒子把 SVG 换成图片
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await rasterizeSvgs(clone)

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
