<script setup lang="ts">
import { computed } from 'vue'
import type { Txn } from '../../../server/src/types'
import { money } from '../format'

const props = defineProps<{ rows: Txn[] }>()

const incomeCount = computed(() => props.rows.filter((r) => r.amount > 0).length)
</script>

<template>
  <div class="txn">
    <div class="tools mono">
      <span>{{ rows.length }} 条 · 消费 {{ rows.length - incomeCount }} · 存入 {{ incomeCount }}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th class="c-time">时间</th>
          <th class="c-name">窗口</th>
          <th class="c-amt">金额</th>
          <th class="c-bal">余额</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="`${r.time}-${i}`" :class="{ income: r.amount > 0 }">
          <td class="mono c-time">
            <span class="d">{{ r.time.slice(5, 10) }}</span>
            <span class="t">{{ r.time.slice(11, 16) }}</span>
          </td>
          <td class="c-name">{{ r.merchant }}</td>
          <td class="mono c-amt">{{ r.amount < 0 ? `−${money(-r.amount)}` : `+${money(r.amount)}` }}</td>
          <td class="mono c-bal">{{ money(r.balance) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.txn {
  padding: 0;
}

.tools {
  padding: 9px 14px 3px;
  font-size: 10px;
  color: var(--muted);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 7px 14px;
  background: var(--panel);
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: left;
}

td {
  padding: 7px 14px;
  border-top: 1px solid color-mix(in srgb, var(--ink) 7%, transparent);
  font-size: 12px;
  vertical-align: middle;
}

tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--ink) 2.5%, transparent);
}

tbody tr:first-child td {
  border-top: 0;
}

.c-time {
  width: 122px;
}

.c-name {
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.c-amt,
.c-bal {
  width: 110px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.c-amt {
  font-size: 12px;
}

.c-bal {
  font-size: 11px;
  color: var(--muted);
}

.d {
  font-size: 10px;
  color: var(--muted);
}

.t {
  margin-left: 6px;
  font-size: 11px;
}

tr.income .c-amt {
  color: var(--accent);
}

tbody tr:hover td {
  background: var(--ink);
  color: var(--paper);
}

tbody tr:hover .d,
tbody tr:hover .t,
tbody tr:hover .c-bal {
  color: var(--paper);
}

@media (max-width: 720px) {
  .c-bal {
    display: none;
  }

  .c-time {
    width: 96px;
  }

  .c-amt {
    width: 92px;
  }

  .c-time .d {
    font-size: 9px;
  }

  .c-time .t {
    margin-left: 4px;
    font-size: 10px;
  }
}
</style>
