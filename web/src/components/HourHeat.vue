<script setup lang="ts">
import { computed, ref } from 'vue'
import { WEEKDAYS } from '../format'

const props = defineProps<{ heat: number[][] }>()

const hours = Array.from({ length: 18 }, (_, i) => i + 6)
const hover = ref<{ w: number; h: number; v: number } | null>(null)

const peak = computed(() => Math.max(1, ...props.heat.flat()))

const cells = computed(() =>
  props.heat.map((row, w) =>
    hours.map((h) => {
      const v = row[h] ?? 0
      const alpha = v === 0 ? 0 : 0.1 + 0.9 * Math.pow(v / peak.value, 0.7)
      return { w, h, v, alpha, dark: alpha >= 0.5 }
    }),
  ),
)
</script>

<template>
  <div class="heat">
    <div class="readout mono">
      <span v-if="hover">{{ WEEKDAYS[hover.w] }} {{ hover.h }}:00 — {{ hover.v }} 笔</span>
      <span v-else class="dim">周 × 小时 · 单日最多 {{ peak }} 笔</span>
    </div>

    <div class="grid">
      <div v-for="(row, w) in cells" :key="w" class="row">
        <span class="day mono">{{ WEEKDAYS[w]!.slice(1) }}</span>
        <div
          v-for="c in row"
          :key="c.h"
          class="cell"
          :class="{ dark: c.dark }"
          :style="c.alpha ? { background: `rgba(18, 17, 15, ${c.alpha.toFixed(3)})` } : undefined"
          @mouseenter="hover = c"
          @mouseleave="hover = null"
        >
          <span v-if="c.v > 0" class="n mono">{{ c.v }}</span>
        </div>
      </div>
    </div>

    <div class="axis">
      <span class="day mono" />
      <span v-for="h in hours" :key="h" class="tick mono">{{ h % 3 === 0 ? h : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.heat {
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
}

.readout {
  min-height: 16px;
  font-size: 10px;
  letter-spacing: 0.02em;
}

.dim {
  color: var(--muted);
}

.grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 1px;
  margin-top: 8px;
}

.row {
  flex: 1;
  display: grid;
  grid-template-columns: 18px repeat(18, minmax(0, 1fr));
  gap: 1px;
  min-height: 18px;
}

.day {
  align-self: center;
  font-size: 10px;
  color: var(--muted);
}

.cell {
  height: 100%;
  display: grid;
  place-items: center;
  border: 1px solid rgba(18, 17, 15, 0.07);
}

.cell:hover {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.n {
  font-size: 9px;
  color: var(--ink);
}

.cell.dark .n {
  color: var(--paper);
}

.axis {
  display: grid;
  grid-template-columns: 18px repeat(18, minmax(0, 1fr));
  gap: 1px;
  margin-top: 2px;
}

.tick {
  font-size: 8px;
  color: var(--muted);
  text-align: left;
}
</style>
