<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StoredCreds } from '../storage'

const props = defineProps<{ initial: StoredCreds; loading: boolean; error: string | null }>()
const emit = defineEmits<{ submit: [StoredCreds] }>()

const hallticket = ref(props.initial.hallticket)
const year = ref(props.initial.year)
const localError = ref('')

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 11 }, (_, i) => thisYear - i)
const shownError = computed(() => localError.value || props.error)

function onSubmit() {
  const ticket = hallticket.value.trim()

  if (!/^[0-9A-Za-z_-]{8,128}$/.test(ticket)) {
    localError.value = 'hallticket 格式不对，应为 8–128 位字母数字。'
    return
  }

  localError.value = ''
  emit('submit', { hallticket: ticket, year: year.value })
}
</script>

<template>
  <div class="entry">
    <section class="intro">
      <div class="headline">
        <h1 class="display">
          白鲸大学
          <br />
          <span class="accent">食堂年报</span>
        </h1>

        <p class="lede">白饭...欸嘿嘿嘿...白饭...</p>
      </div>
    </section>

    <form class="panel" @submit.prevent="onSubmit">
      <div class="fields">
        <label class="field">
          <span class="label">hallticket</span>
          <input
            v-model.trim="hallticket"
            name="hallticket"
            autocomplete="off"
            spellcheck="false"
            placeholder="个人中心 Cookie 中的 hallticket"
          />
        </label>

        <label class="field">
          <span class="label">统计年度</span>
          <select v-model="year" name="year">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>

        <button class="btn submit" type="submit" :disabled="loading">
          {{ loading ? '抓取中 —' : '生成报告 →' }}
        </button>
      </div>

      <div class="panel-foot">
        <p v-if="shownError" class="error">{{ shownError }}</p>

        <details class="how">
          <summary class="label">hallticket 在哪？</summary>
          <ol>
            <li>
              打开
              <a class="link" href="https://card.pku.edu.cn" target="_blank" rel="noopener noreferrer">
                card.pku.edu.cn ↗
              </a>
              &nbsp;登录。
            </li>
            <li>F12 打开 DevTools → <b>Network</b>，刷新页面，点开 <b class="mono">GetCardInfoByAccountNoParm</b>。</li>
            <li>Request Headers 的 Cookie 里复制 <b class="mono">hallticket</b> 的值。</li>
          </ol>
        </details>
      </div>
    </form>
  </div>
</template>

<style scoped>
.entry {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  border: 1px solid var(--line);
}

.intro {
  padding: 64px 40px;
  border-right: 1px solid var(--line);
  display: flex;
  justify-content: center;
}

.headline {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 22px;
}

.display {
  font-size: clamp(52px, 7.6vw, 104px);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.045em;
}

.display .accent {
  color: var(--accent);
}

.lede {
  max-width: 22ch;
  font-size: 15px;
  line-height: 1.75;
  color: var(--muted);
  text-wrap: pretty;
}

/* 1fr / auto / 1fr：表单块严格垂直居中，展开说明只占用下方轨道，不改变它的位置 */
.panel {
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  justify-items: center;
  padding: 44px 48px;
  background: var(--panel);
}

.fields {
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 26px;
  width: min(100%, 400px);
}

.panel-foot {
  grid-row: 3;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 400px);
  margin-top: 22px;
}

.submit {
  margin-top: 4px;
  text-align: left;
}

.how {
  border-top: 1px solid var(--hair);
  padding-top: 14px;
}

.how summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
}

.how summary::after {
  content: '+';
  font-family: var(--mono);
  font-size: 12px;
}

.how[open] summary::after {
  content: '−';
}

.how ol {
  margin-top: 14px;
  display: grid;
  gap: 8px;
  counter-reset: step;
}

.how li {
  counter-increment: step;
  position: relative;
  padding-left: 24px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.how li::before {
  content: counter(step, decimal-leading-zero);
  position: absolute;
  left: 0;
  top: 1px;
  font-family: var(--mono);
  font-size: 9px;
  color: var(--accent);
}

.link {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  color: var(--ink);
  font-weight: 550;
}

.link:hover {
  color: var(--accent);
  text-decoration-color: var(--accent);
}

/* 视口太矮时放弃居中，避免展开内容溢出卡片 */
@media (max-height: 760px) and (min-width: 901px) {
  .panel {
    grid-template-rows: auto auto;
    align-content: start;
  }
}

@media (max-width: 900px) {
  .entry {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .intro {
    border-right: 0;
    border-bottom: 1px solid var(--line);
    padding: 28px 18px 24px;
    gap: 14px;
  }

  .headline {
    gap: 14px;
  }

  .panel {
    grid-template-rows: auto auto;
    padding: 28px 18px 32px;
  }

  .panel-foot {
    margin-top: 18px;
  }

  .lede {
    max-width: none;
  }
}
</style>
