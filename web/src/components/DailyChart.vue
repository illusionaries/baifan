<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DayStat } from '../../../server/src/types'
import { money } from '../format'

const props = defineProps<{
  daily: DayStat[]
  monthly: { month: number; amount: number; count: number }[]
}>()

const hover = ref<number | null>(null)

const peak = computed(() =>
  props.daily.reduce((a, b) => (b.amount > a.amount ? b : a), { date: '—', amount: 0, count: 0 }),
)
const scale = computed(() => Math.max(1, peak.value.amount))
const spentDays = computed(() => props.daily.filter((d) => d.amount > 0).length)
const current = computed(() => (hover.value === null ? null : (props.daily[hover.value] ?? null)))

/** 每个月的日期区间，用来画背景的月度合计柱 */
const months = computed(() => {
  const n = props.daily.length
  if (n === 0) return []

  const out: { month: number; left: number; width: number; amount: number }[] = []
  let start = 0

  for (let i = 1; i <= n; i++) {
    const month = props.daily[start]!.date.slice(5, 7)
    if (i < n && props.daily[i]!.date.slice(5, 7) === month) continue

    const num = Number(month)
    out.push({
      month: num,
      left: (start / n) * 100,
      width: ((i - start) / n) * 100,
      amount: props.monthly.find((m) => m.month === num)?.amount ?? 0,
    })
    start = i
  }

  return out
})
const monthMax = computed(() => Math.max(1, ...months.value.map((m) => m.amount)))

/** 只有悬停时才显示该月合计，避免未悬停时展示一个随机月份 */
const focus = computed(() => {
  if (!current.value) return null
  const month = Number(current.value.date.slice(5, 7))
  return months.value.find((m) => m.month === month) ?? null
})

const monthTicks = computed(() =>
  props.daily.reduce<{ left: number; label: string }[]>((acc, d, i) => {
    const m = d.date.slice(5, 7)
    if (i === 0 || props.daily[i - 1]!.date.slice(5, 7) !== m) {
      acc.push({ left: (i / Math.max(1, props.daily.length)) * 100, label: `${Number(m)}月` })
    }
    return acc
  }, []),
)

function onMove(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  const idx = Math.floor(ratio * props.daily.length)
  hover.value = Math.min(props.daily.length - 1, Math.max(0, idx))
}
</script>

<template>
  <div class="day">
    <div class="readout">
      <div class="line">
        <template v-if="current">
          <span class="mono date">{{ current.date }}</span>
          <template v-if="current.amount > 0">
            <span class="mono strong">¥{{ money(current.amount) }}</span>
            <span class="mono dim">{{ current.count }} 笔</span>
          </template>
          <span v-else class="mono dim">无消费</span>
        </template>
        <template v-else>
          <span class="mono dim">{{ spentDays }} / {{ daily.length }} 天有消费</span>
          <span class="mono dim">峰值 ¥{{ money(peak.amount) }} · {{ peak.date }}</span>
        </template>
      </div>

      <div class="line month">
        <span v-if="focus" class="mono">{{ focus.month }} 月合计 ¥{{ money(focus.amount) }}</span>
      </div>
    </div>

    <div class="plot" @mousemove="onMove" @mouseleave="hover = null">
      <div class="month-layer" aria-hidden="true">
        <span
          v-for="m in months"
          :key="m.month"
          class="month-bar"
          :style="{ left: `${m.left}%`, width: `${m.width}%`, height: `${(m.amount / monthMax) * 100}%` }"
        />
      </div>

      <div class="bars">
        <div v-for="(d, i) in daily" :key="d.date" class="slot" :class="{ active: hover === i }">
          <div
            class="bar"
            :class="{ zero: d.amount === 0 }"
            :style="{ height: d.amount === 0 ? '1px' : `${Math.max(1.5, (d.amount / scale) * 100)}%` }"
          />
        </div>
      </div>
    </div>

    <div class="axis">
      <span v-for="t in monthTicks" :key="t.left" class="tick mono" :style="{ left: `${t.left}%` }">{{ t.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.day {
  padding: 12px 14px 6px;
}

.readout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 32px;
  font-size: 11px;
}

.line {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  align-items: baseline;
}

.line > span {
  white-space: nowrap;
}

.readout .month {
  min-height: 13px;
  font-size: 10px;
  color: var(--muted);
}

.date {
  font-size: 11px;
}

.strong {
  color: var(--accent);
}

.dim {
  color: var(--muted);
}

.plot {
  position: relative;
  margin-top: 8px;
  cursor: crosshair;
}

.month-layer {
  position: absolute;
  inset: 0 0 0 0;
}

.month-bar {
  position: absolute;
  bottom: 0;
  background: rgba(18, 17, 15, 0.08);
  border-top: 1px solid rgba(18, 17, 15, 0.24);
}

.bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 0;
  height: 176px;
  border-bottom: 1px solid var(--line);
}

.slot {
  flex: 1 1 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
  min-width: 0;
}

.bar {
  width: 100%;
  background: var(--ink);
}

.bar.zero {
  background: var(--hair);
}

.slot.active .bar {
  background: var(--accent);
}

.slot.active .bar.zero {
  background: var(--accent);
}

.axis {
  position: relative;
  height: 18px;
}

.tick {
  position: absolute;
  top: 3px;
  font-size: 9px;
  color: var(--muted);
  transform: translateX(-1px);
}
</style>
