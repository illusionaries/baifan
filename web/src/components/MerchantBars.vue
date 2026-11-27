<script setup lang="ts">
import { computed } from 'vue'
import type { MerchantStat } from '../../../server/src/types'
import { money, pct } from '../format'

const props = defineProps<{ items: MerchantStat[]; limit?: number }>()

const shown = computed(() => props.items.slice(0, props.limit ?? 15))
const peak = computed(() => Math.max(1, ...shown.value.map((i) => i.amount)))
</script>

<template>
  <div class="bars">
    <ol>
      <li v-for="(item, i) in shown" :key="item.name" class="row">
        <div class="top">
          <span class="rank mono">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="name" :title="item.name">{{ item.name }}</span>
          <span class="count mono">{{ item.count }} 笔</span>
          <span class="amt mono">¥{{ money(item.amount) }}</span>
        </div>
        <div class="track">
          <div class="fill" :style="{ width: `${(item.amount / peak) * 100}%` }" />
          <span class="share mono">{{ pct(item.share) }}</span>
        </div>
      </li>
    </ol>
    <p v-if="props.items.length > shown.length" class="more label">
      另有 {{ props.items.length - shown.length }} 个窗口未列出 · 总计 {{ props.items.length }} 个
    </p>
    <p v-if="!props.items.length" class="empty label">这一年没有消费记录</p>
  </div>
</template>

<style scoped>
.bars {
  padding: 4px 0 12px;
}

.row {
  padding: 8px 14px 6px;
  border-bottom: 1px solid var(--hair);
  transition: background 0.1s linear;
}

.row:last-child {
  border-bottom: 0;
}

.row:hover {
  background: rgba(18, 17, 15, 0.04);
}

.top {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: baseline;
}

.rank {
  font-size: 10px;
  color: var(--muted);
}

.name {
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count {
  font-size: 10px;
  color: var(--muted);
}

.amt {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.track {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  height: 9px;
}

.fill {
  height: 100%;
  background: var(--ink);
  min-width: 2px;
}

.share {
  margin-left: auto;
  font-size: 9px;
  color: var(--muted);
  white-space: nowrap;
}

.more,
.empty {
  padding: 10px 14px 0;
}

.empty {
  padding: 18px 14px 24px;
}
</style>
