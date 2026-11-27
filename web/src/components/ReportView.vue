<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Report } from '../../../server/src/types'
import { exportNodeToPng } from '../export'
import { WEEKDAYS, money, pct } from '../format'
import BalanceChart from './BalanceChart.vue'
import DailyChart from './DailyChart.vue'
import HourHeat from './HourHeat.vue'
import MerchantBars from './MerchantBars.vue'
import TxnTable from './TxnTable.vue'

const props = defineProps<{ report: Report; loading: boolean }>()
const emit = defineEmits<{ reset: []; 'change-year': [number] }>()

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 11 }, (_, i) => thisYear - i)

const sheet = ref<HTMLElement | null>(null)
const exporting = ref(false)
const exportError = ref('')

async function exportPng() {
  if (!sheet.value) return
  exporting.value = true
  exportError.value = ''
  try {
    await exportNodeToPng(sheet.value, `食堂年报-${props.report.meta.year}.png`)
  } catch (err) {
    exportError.value = `导出失败：${(err as Error).message}`
  } finally {
    exporting.value = false
  }
}

const s = computed(() => props.report.summary)
const kinds = computed(() => [...props.report.kinds].sort((a, b) => b.amount - a.amount))
const weekMax = computed(() => Math.max(1, ...props.report.weekly))
const tickets = computed(() =>
  props.report.transactions
    .filter((t) => t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5),
)
</script>

<template>
  <article ref="sheet" class="sheet" :aria-busy="loading">
    <div v-if="loading" class="progress"><span /></div>

    <header class="head">
      <div>
        <p class="label">CAMPUS CARD ANNUAL REPORT</p>
        <h1>
          <span class="yr mono">{{ report.meta.year }}</span>
          <span class="slash">/</span>
          食堂年报
        </h1>
      </div>
      <div class="head-actions" data-export="omit">
        <button class="btn ghost" type="button" :disabled="exporting" @click="exportPng">
          {{ exporting ? '生成中 —' : '导出 PNG' }}
        </button>
        <button class="btn ghost" type="button" @click="emit('reset')">换一份</button>
      </div>
      <p v-if="exportError" class="export-error mono">{{ exportError }}</p>
    </header>

    <section class="hero">
      <div>
        <p class="label">全年总支出 / TOTAL SPEND</p>
        <p class="amount">
          <span class="cur">¥</span>{{ money(s.spend) }}
        </p>
        <p class="hero-note">
          <b>{{ s.spendCount }}</b> 笔消费 · <b>{{ s.merchantCount }}</b> 个窗口 · <b>{{ s.activeDays }}</b> 天有记录
          <span class="sep">|</span>
          同期存入 ¥{{ money(s.income) }}（{{ s.incomeCount }} 笔）
        </p>
      </div>

      <div class="year-pick" data-export="omit">
        <div class="years">
          <button
            v-for="y in years"
            :key="y"
            type="button"
            class="mono"
            :class="{ on: y === report.meta.year }"
            :disabled="loading || y === report.meta.year"
            @click="emit('change-year', y)"
          >
            {{ y }}
          </button>
        </div>
      </div>
    </section>

    <section class="kpis">
      <div class="kpi">
        <p class="label">单笔最高</p>
        <p class="v mono">¥{{ money(s.maxTxn?.amount ?? 0) }}</p>
        <p class="n">{{ s.maxTxn?.merchant ?? '—' }}</p>
      </div>
      <div class="kpi">
        <p class="label">有消费的天均</p>
        <p class="v mono">¥{{ money(s.avgPerActiveDay) }}</p>
        <p class="n">{{ s.activeDays }} 天 / {{ report.daily.length }} 天</p>
      </div>
      <div class="kpi">
        <p class="label">单笔均价</p>
        <p class="v mono">¥{{ money(s.avgPerTxn) }}</p>
        <p class="n">{{ s.spendCount }} 笔</p>
      </div>
      <div class="kpi">
        <p class="label">最长连续干饭</p>
        <p class="v mono">{{ s.streak }} <small>天</small></p>
        <p class="n">首笔 {{ s.first?.slice(0, 10) ?? '—' }}</p>
      </div>
    </section>

    <section class="insights">
      <div v-for="ins in report.insights" :key="ins.label" class="ins">
        <p class="label">{{ ins.label }}</p>
        <p class="iv">{{ ins.value }}</p>
        <p class="in">{{ ins.note }}</p>
      </div>
    </section>

    <div class="split cols-a">
      <section class="col">
        <div class="card-head">
          <span class="idx">01</span>
          <h2>窗口排行</h2>
        </div>
        <MerchantBars :items="report.merchants" :limit="15" />
      </section>

      <section class="col">
        <div class="card-head">
          <span class="idx">02</span>
          <h2>餐段 & 类型</h2>
        </div>

        <div class="slots">
          <div class="stack">
            <span
              v-for="slot in report.slots"
              :key="slot.key"
              class="seg"
              :class="`seg-${slot.key}`"
              :style="{ width: `${slot.share * 100}%` }"
              :title="`${slot.label} ${pct(slot.share)}`"
            />
          </div>

          <ul class="slot-rows">
            <li v-for="slot in report.slots" :key="slot.key">
              <span class="dot" :class="`seg-${slot.key}`" />
              <span class="sl">{{ slot.label }}</span>
              <span class="sr mono">{{ slot.range }}</span>
              <span class="sc mono">{{ slot.count }} 笔</span>
              <span class="sa mono">¥{{ money(slot.amount) }}</span>
              <span class="sp mono">{{ pct(slot.share) }}</span>
            </li>
          </ul>
        </div>

        <div class="kinds">
          <p class="label kinds-title">消费类型</p>
          <ul class="kind-rows">
            <li v-for="k in kinds" :key="k.key">
              <span class="dot kind" />
              <span class="sl">{{ k.label }}</span>
              <span class="sr mono">{{ k.count }} 笔</span>
              <span class="sa mono">¥{{ money(k.amount) }}</span>
              <span class="sp mono">{{ pct(k.share) }}</span>
            </li>
          </ul>
        </div>

        <div class="wk">
          <p class="label kinds-title">按星期</p>
          <div v-for="(v, i) in report.weekly" :key="i" class="wk-row">
            <span class="mono wl">{{ WEEKDAYS[i] }}</span>
            <span class="wk-track"><span class="wk-fill" :style="{ width: `${(v / weekMax) * 100}%` }" /></span>
            <span class="mono wa">¥{{ money(v) }}</span>
          </div>
        </div>

        <div class="tickets">
          <p class="label kinds-title">最贵五笔</p>
          <ul>
            <li v-for="(t, i) in tickets" :key="t.time + i">
              <span class="mono tr">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="tn" :title="t.merchant">{{ t.merchant }}</span>
              <span class="mono td">{{ t.time.slice(5, 10) }}</span>
              <span class="mono ta">¥{{ money(-t.amount) }}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <section class="sec">
      <div class="card-head">
        <span class="idx">03</span>
        <h2>每日支出</h2>
        <div class="legend">
          <span><i class="sw day" />日</span>
          <span><i class="sw month" />月合计</span>
        </div>
      </div>
      <DailyChart :daily="report.daily" :monthly="report.monthly" />
    </section>

    <div class="split cols-b">
      <section class="col">
        <div class="card-head">
          <span class="idx">04</span>
          <h2>时段热力</h2>
        </div>
        <HourHeat :heat="report.heat" />
      </section>

      <section class="col">
        <div class="card-head">
          <span class="idx">05</span>
          <h2>卡内余额</h2>
        </div>
        <BalanceChart :points="report.balance" :from="report.meta.from" :to="report.meta.to" />

      </section>
    </div>

    <section class="sec" data-export="omit">
      <div class="card-head">
        <span class="idx">06</span>
        <h2>流水明细</h2>
      </div>
      <TxnTable :rows="report.transactions" />
    </section>

  </article>
</template>

<style scoped>
.sheet {
  border: 1px solid var(--line);
  background: var(--panel);
  position: relative;
}

.progress {
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  overflow: hidden;
  background: var(--hair);
}

.progress span {
  display: block;
  height: 100%;
  width: 30%;
  background: var(--accent);
  animation: slide 0.9s linear infinite;
}

@keyframes slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(340%);
  }
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
  align-items: start;
}

.head h1 {
  margin-top: 8px;
  font-size: clamp(30px, 4.2vw, 50px);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.yr {
  color: var(--accent);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.slash {
  color: var(--hair);
  font-weight: 300;
  transform: translateY(-2px);
}

.head-actions {
  display: flex;
  gap: 8px;
  justify-content: end;
}

.head-actions .btn {
  padding: 7px 14px;
  font-size: 10px;
}

.export-error {
  grid-column: 1 / -1;
  font-size: 10px;
  color: var(--accent);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  align-items: end;
  gap: 24px;
  padding: 24px 22px 22px;
  border-bottom: 1px solid var(--line);
}

.amount {
  margin-top: 4px;
  font-family: var(--sans);
  font-size: clamp(46px, 7.4vw, 88px);
  line-height: 0.9;
  letter-spacing: -0.055em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cur {
  font-size: 0.4em;
  vertical-align: 0.62em;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--muted);
  margin-right: 4px;
}

.hero-note {
  margin-top: 14px;
  font-size: 12px;
  color: var(--muted);
}

.hero-note b {
  color: var(--ink);
  font-weight: 600;
}

.sep {
  margin: 0 8px;
  color: var(--hair);
}

.year-pick {
  display: grid;
  gap: 8px;
  justify-items: end;
}

.years {
  display: flex;
  width: max-content;
  border: 1px solid var(--line);
}

.years button {
  flex: 0 1 auto;
  min-width: 0;
  padding: 8px 9px;
  white-space: nowrap;
  border: 0;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s linear, color 0.1s linear;
}

.years button + button {
  border-left: 1px solid var(--line);
}

.years button:hover:not(:disabled) {
  background: var(--accent);
  color: var(--paper);
}

.years button.on {
  background: var(--ink);
  color: var(--paper);
}

.years button:disabled {
  cursor: default;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--line);
}

.kpi {
  padding: 14px 18px 16px;
}

.kpi + .kpi {
  border-left: 1px solid var(--line);
}

.kpi .v {
  margin-top: 8px;
  font-size: clamp(22px, 2.6vw, 30px);
  letter-spacing: -0.03em;
  line-height: 1;
}

.kpi .v small {
  font-size: 0.45em;
  letter-spacing: 0;
  color: var(--muted);
}

.kpi .n {
  margin-top: 6px;
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--line);
}

.ins {
  padding: 13px 18px 15px;
  border-top: 1px solid var(--line);
}

.ins:nth-child(3n + 2),
.ins:nth-child(3n + 3) {
  border-left: 1px solid var(--line);
}

.ins:nth-child(-n + 3) {
  border-top: 0;
}

.iv {
  margin-top: 7px;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.in {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
}

.split {
  display: grid;
  border-bottom: 1px solid var(--line);
}

.cols-a {
  grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
}

.cols-b {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.split > .col + .col {
  border-left: 1px solid var(--line);
}

/* 04 / 05 两栏等高：让热力和月度吃掉剩余纵向空间 */
.cols-b > .col {
  display: flex;
  flex-direction: column;
}

.cols-b > .col > .heat,
.cols-b > .col > .bal {
  flex: 1;
}

.sec {
  border-bottom: 1px solid var(--line);
}

/* 最后一块的底边交给 sheet 自己的边框，避免 1+1 叠成 2px */
.sheet > :last-child {
  border-bottom: 0;
}

.slots {
  padding: 14px;
}

.stack {
  display: flex;
  height: 26px;
  border: 1px solid var(--line);
}

.seg {
  height: 100%;
}

.seg-breakfast {
  background: #8a8478;
}

.seg-lunch {
  background: var(--ink);
}

.seg-dinner {
  background: #5a5549;
}

.seg-night {
  background: #b3ada0;
}

.slot-rows {
  margin-top: 10px;
  display: grid;
  gap: 0;
}

.slot-rows li {
  display: grid;
  grid-template-columns: 10px 52px 1fr auto auto 56px;
  gap: 8px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid var(--hair);
  font-size: 11px;
}

.slot-rows li:last-child {
  border-bottom: 0;
}

.dot {
  width: 8px;
  height: 8px;
}

.dot.kind {
  background: var(--ink);
}

.sr,
.sc,
.sp {
  font-size: 9px;
  color: var(--muted);
}

.sp {
  text-align: right;
}

.sa {
  font-size: 11px;
}

.sc {
  text-align: right;
}

.kinds {
  border-top: 1px solid var(--line);
  padding: 12px 14px 6px;
}

.kind-rows li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto 52px;
  gap: 8px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid var(--hair);
  font-size: 11px;
}

.kind-rows li:last-child {
  border-bottom: 0;
}

.tickets {
  border-top: 1px solid var(--line);
  padding: 12px 14px 12px;
}

.tickets ul {
  margin-top: 2px;
}

.tickets li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 44px 66px;
  gap: 8px;
  align-items: baseline;
  padding: 4px 0;
  font-size: 11px;
}

.tr {
  font-size: 9px;
  color: var(--accent);
}

.tn {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.td {
  font-size: 9px;
  color: var(--muted);
}

.ta {
  font-size: 11px;
  text-align: right;
}

.kinds-title {
  margin-bottom: 4px;
}

.legend {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-left: auto;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  vertical-align: -1px;
}

.sw.day {
  background: var(--ink);
}

.sw.month {
  background: rgba(18, 17, 15, 0.12);
  box-shadow: inset 0 1px 0 rgba(18, 17, 15, 0.28);
}
.wk {
  padding: 10px 14px 14px;
}

.wk-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 74px;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
}

.wl {
  font-size: 9px;
  color: var(--muted);
}

.wk-track {
  height: 6px;
  background: rgba(18, 17, 15, 0.08);
}

.wk-fill {
  display: block;
  height: 100%;
  background: var(--ink);
}

.wa {
  font-size: 9px;
  text-align: right;
  color: var(--muted);
}



@media (max-width: 980px) {
  .cols-a,
  .cols-b {
    grid-template-columns: minmax(0, 1fr);
  }

  .split > .col + .col {
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .insights {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ins:nth-child(3n + 2),
  .ins:nth-child(3n + 3) {
    border-left: 0;
  }

  .ins:nth-child(2n) {
    border-left: 1px solid var(--line);
  }

  .ins:nth-child(-n + 3) {
    border-top: 1px solid var(--line);
  }

  .ins:nth-child(-n + 2) {
    border-top: 0;
  }
}

@media (max-width: 760px) {
  .head,
  .hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .year-pick {
    justify-items: start;
    text-align: left;
  }

  .head-actions {
    justify-content: start;
  }

  .year-pick {
    width: 100%;
  }

  .years {
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .years::-webkit-scrollbar {
    display: none;
  }

  .years button {
    flex: 0 0 auto;
    padding: 8px 8px;
    font-size: 10px;
  }

  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kpi:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .kpi:nth-child(4) {
    border-top: 1px solid var(--line);
  }

  .insights {
    grid-template-columns: minmax(0, 1fr);
  }

  .ins:nth-child(2n) {
    border-left: 0;
  }

  .ins:nth-child(n + 2) {
    border-top: 1px solid var(--line);
  }

  .ins:nth-child(-n + 2) {
    border-top: 1px solid var(--line);
  }

  .ins:first-child {
    border-top: 0;
  }
}
</style>
