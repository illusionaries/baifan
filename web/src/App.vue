<script setup lang="ts">
import { ref } from 'vue'
import type { Report } from '../../server/src/types'
import { api } from './api'
import EntryForm from './components/EntryForm.vue'
import ReportView from './components/ReportView.vue'
import { loadCreds, saveCreds, type StoredCreds } from './storage'

const INSPIRED = {
  name: 'KingRayCao/PKU-Annual-Eat',
  url: 'https://github.com/KingRayCao/PKU-Annual-Eat',
}

const creds = ref(loadCreds())
const report = ref<Report | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return '请求失败，请检查凭据后重试。'
}

async function run(payload: StoredCreds) {
  loading.value = true
  error.value = null

  try {
    const { data, error: failure } = await api.api.report.cookie.post(payload)
    if (failure) {
      error.value = readMessage(failure.value)
      report.value = null
      return
    }
    report.value = data as Report
    saveCreds(payload)
    creds.value = payload
  } catch (err) {
    error.value = `连不上本机 API：${(err as Error).message}。先运行 bun run dev。`
    report.value = null
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="wrap page" :class="{ 'page-entry': !report }">
    <ReportView
      v-if="report"
      :report="report"
      :loading="loading"
      @reset="((report = null), (error = null))"
      @change-year="run({ ...creds, year: $event })"
    />
    <EntryForm v-else :initial="creds" :loading="loading" :error="error" @submit="run" />

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
