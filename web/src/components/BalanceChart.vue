<script setup lang="ts">
import { computed, ref } from 'vue'
import { money } from '../format'

const props = defineProps<{
  points: { time: string; value: number }[]
  from: string
  to: string
}>()

const timeOf = (value: string) => Date.parse(`${value.replace(' ', 'T')}+08:00`)
const dayOf = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(ms))

const hover = ref<{ ratio: number; value: number; date: string } | null>(null)

const span = computed(() => {
  const start = Date.parse(`${props.from}T00:00:00+08:00`)
  const end = Date.parse(`${props.to}T23:59:59+08:00`)
  return { start, end, ms: Math.max(1, end - start) }
})

const geom = computed(() => {
  const pts = props.points
  if (pts.length < 2) return null

  const values = pts.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const scale = max - min || 1
  const { start, ms } = span.value

  const x = (t: number) => Math.min(1000, Math.max(0, ((t - start) / ms) * 1000))
  // 基线压到 viewBox 底边，和填色、坐标轴对齐
  const y = (v: number) => 160 - ((v - min) / scale) * 138

  // 余额是阶梯函数：没刷卡就不变，所以水平段 + 垂直跳变，而不是直线插值
  let line = `M0,${y(pts[0]!.value).toFixed(1)}`
  for (const p of pts) line += `H${x(timeOf(p.time)).toFixed(1)}V${y(p.value).toFixed(1)}`
  line += 'H1000'

  // 填色铺到 viewBox 底边（.plot 的 border-bottom 就是轴），折线最低点也落在同一条线上
  return { line, area: `${line} L1000,160 L0,160 Z`, min, max, y, start, ms }
})

/** 每月一号的刻度，按真实时间定位 */
const ticks = computed(() => {
  if (!geom.value) return []
  const year = Number(props.from.slice(0, 4))
  const out: { month: number; left: number }[] = []

  for (let month = 1; month <= 12; month++) {
    const t = Date.parse(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
    if (t > span.value.end) break
    out.push({ month, left: ((t - span.value.start) / span.value.ms) * 100 })
  }

  return out
})

const first = computed(() => props.points[0] ?? null)
const last = computed(() => props.points[props.points.length - 1] ?? null)

function onMove(event: MouseEvent) {
  const g = geom.value
  if (!g) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const at = g.start + ratio * g.ms

  // 该时刻生效的余额 = 时间戳不晚于它的最后一笔
  let lo = 0
  let hi = props.points.length - 1
  let idx = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (timeOf(props.points[mid]!.time) <= at) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  const point = props.points[idx]!
  hover.value = { ratio, value: point.value, date: dayOf(at) }
}

const activeY = computed(() => (hover.value && geom.value ? (geom.value.y(hover.value.value) / 160) * 100 : 0))
</script>

<template>
  <div class="bal">
    <div class="head mono">
      <span class="label">卡内余额</span>
      <span v-if="hover" class="readout">
        <span class="dim">{{ hover.date }}</span>
        <span class="strong">¥{{ money(hover.value) }}</span>
      </span>
      <span v-else-if="first && last" class="readout dim">
        {{ first.time.slice(0, 10) }} ¥{{ money(first.value) }} → ¥{{ money(last.value) }}
      </span>
    </div>

    <div v-if="geom" class="plot-wrap" @mousemove="onMove" @mouseleave="hover = null">
      <svg class="plot" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
        <path :d="geom.area" class="area" />
        <path :d="geom.line" class="line" />
      </svg>
      <template v-if="hover">
        <span class="cursor" :style="{ left: `${hover.ratio * 100}%` }" />
        <span class="dot" :style="{ left: `${hover.ratio * 100}%`, top: `${activeY}%` }" />
      </template>
    </div>
    <div v-else class="empty label">余额数据不足</div>

    <div v-if="geom" class="axis">
      <span v-for="t in ticks" :key="t.month" class="tick mono" :style="{ left: `${t.left}%` }">{{ t.month }}月</span>
    </div>

    <div v-if="geom" class="scale mono">
      <span>最富有时 ¥{{ money(geom.max) }}</span>
      <span>最贫穷时 ¥{{ money(geom.min) }}</span>
    </div>
  </div>
</template>

<style scoped>
.bal {
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 10px;
  min-height: 14px;
}

.readout {
  display: flex;
  gap: 10px;
}

.dim {
  color: var(--muted);
}

.strong {
  color: var(--accent);
}

.plot-wrap {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-top: 8px;
  cursor: crosshair;
}

.plot {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 118px;
  border-bottom: 1px solid var(--line);
}

.area {
  fill: rgba(18, 17, 15, 0.07);
}

.line {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1.25;
}

.cursor {
  position: absolute;
  top: 0;
  bottom: 1px;
  width: 1px;
  background: var(--accent);
}

.dot {
  position: absolute;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  background: var(--accent);
}

.axis {
  position: relative;
  height: 14px;
  margin-top: 2px;
}

.tick {
  position: absolute;
  top: 0;
  font-size: 8px;
  color: var(--muted);
  transform: translateX(-1px);
}

.scale {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 9px;
  color: var(--muted);
}

.empty {
  padding: 24px 0;
}
</style>
