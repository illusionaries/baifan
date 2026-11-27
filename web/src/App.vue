<script setup lang="ts">
import { ref } from 'vue'
import type { Report, ReportResponse } from '../../server/src/types'
import { api } from './api'
import EntryForm from './components/EntryForm.vue'
import ReportView from './components/ReportView.vue'
import { loadCreds, saveCreds, type EntryPayload, type StoredCreds } from './storage'

const INSPIRED = {
  name: 'KingRayCao/PKU-Annual-Eat',
  url: 'https://github.com/KingRayCao/PKU-Annual-Eat',
}

const creds = ref(loadCreds())
const report = ref<Report | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const errorCode = ref<string | null>(null)

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return '请求失败，请检查凭据后重试。'
}

function readCode(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const code = (value as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return null
}

async function run(payload: EntryPayload) {
  loading.value = true
  error.value = null
  errorCode.value = null

  try {
    const res =
      payload.mode === 'iaaa'
        ? await api.api.report.iaaa.post({
            username: payload.username,
            password: payload.password,
            otp: payload.otp,
            year: payload.year,
          })
        : await api.api.report.cookie.post({
            hallticket: payload.hallticket,
            account: payload.account,
            year: payload.year,
          })

    if (res.error) {
      error.value = readMessage(res.error.value)
      errorCode.value = readCode(res.error.value)
      report.value = null
      return
    }

    // 两条路都回带 session：password 从不落盘，之后统一用 hallticket
    const data = res.data as ReportResponse
    report.value = data
    creds.value = {
      mode: 'cookie',
      account: data.session.account,
      hallticket: data.session.hallticket,
      username: payload.mode === 'iaaa' ? payload.username : creds.value.username,
      year: payload.year,
    }
    saveCreds(creds.value)
  } catch (err) {
    error.value = `连不上本机 API：${(err as Error).message}。先运行 bun run dev。`
    report.value = null
  } finally {
    loading.value = false
  }
}

/** 换年份：复用已存下的 account + hallticket，不必重新登录 */
function changeYear(year: number) {
  const { account, hallticket } = creds.value
  if (!hallticket) return
  run({ mode: 'cookie', account, hallticket, year })
}
</script>

<template>
  <div class="wrap page" :class="{ 'page-entry': !report }">
    <ReportView
      v-if="report"
      :report="report"
      :loading="loading"
      @reset="((report = null), (error = null))"
      @change-year="changeYear"
    />
    <EntryForm v-else :initial="creds" :loading="loading" :error="error" :error-code="errorCode" @submit="run" />

    <footer class="site-foot mono">
      <a href="https://github.com/illusionaries/baifan" target="_blank" rel="noopener noreferrer">
        github.com/illusionaries/baifan
      </a>
      <span>
        inspired by
        <a :href="INSPIRED.url" target="_blank" rel="noopener noreferrer">{{ INSPIRED.name }}</a>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.page {
  padding-top: 18px;
}

.page-entry {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 18px);
  padding-bottom: 18px;
}

.page-entry > :first-child {
  flex: 1;
}

.site-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 20px;
  margin-top: 14px;
  padding: 0 2px;
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--muted);
}

.site-foot a {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.site-foot a:hover {
  color: var(--accent);
  text-decoration-color: var(--accent);
}
</style>
