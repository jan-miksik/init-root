<template>
  <main class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Agent Managers</h1>
        <p class="page-subtitle">{{ managers.length }} paper-only managers · {{ managers.filter(m => m.status === 'running').length }} running</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <NuxtLink to="/managers/new" class="btn btn-primary">+ New Manager</NuxtLink>
      </div>
    </div>

    <div v-if="pending" class="page-loader">
      <div class="page-loader-track">
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
        <span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" /><span class="page-loader-block" />
      </div>
      <span class="page-loader-label">Loading managers</span>
    </div>

    <div v-else-if="error" class="alert alert-error">Failed to load managers.</div>

    <div v-else-if="managers.length === 0" class="empty-state">
      <div class="empty-icon">🧠</div>
      <div class="empty-title">No paper managers yet</div>
      <p>Create a manager to autonomously run and optimize paper trading agents.</p>
      <NuxtLink to="/managers/new" class="btn btn-primary" style="margin-top: 16px;">Create Manager</NuxtLink>
    </div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 32px;"></th>
            <th class="sortable" @click="toggleSort('name')">Name <span class="sort-icon">{{ sortIcon('name') }}</span></th>
            <th class="sortable" @click="toggleSort('status')">Status <span class="sort-icon">{{ sortIcon('status') }}</span></th>
            <th>Model</th>
            <th class="sortable" @click="toggleSort('decisionInterval')">Interval <span class="sort-icon">{{ sortIcon('decisionInterval') }}</span></th>
            <th class="sortable" @click="toggleSort('agentCount')">Agents <span class="sort-icon">{{ sortIcon('agentCount') }}</span></th>
            <th class="sortable" @click="toggleSort('createdAt')">Created <span class="sort-icon">{{ sortIcon('createdAt') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in sortedManagers"
            :key="m.id"
            class="manager-table-row"
            @click="$router.push(`/managers/${m.id}`)"
          >
            <td style="font-size: 18px; line-height: 1;">{{ managerEmoji(m) }}</td>
            <td style="font-weight: 500; color: var(--text);">{{ m.name }}</td>
            <td><span class="badge" :class="badgeClass(m.status)">{{ m.status }}</span></td>
            <td style="color: var(--text-muted); font-size: 12px;">{{ shortModel(m.config?.llmModel) }}</td>
            <td class="mono" style="font-size: 12px;">{{ m.config?.decisionInterval ?? '—' }}</td>
            <td class="mono" style="font-size: 12px;">{{ m.agentCount ?? '—' }}</td>
            <td style="color: var(--text-muted); font-size: 12px;">{{ formatDate(m.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { getManagerProfile, DEFAULT_MANAGER_PROFILE_ID } from '@something-in-loop/shared';
import type { ManagerSummary } from '~/composables/useManagers';

definePageMeta({ ssr: false });

const { managers, loading: pending, error, fetchManagers } = useManagers();
await fetchManagers();

type SortKey = 'name' | 'status' | 'decisionInterval' | 'agentCount' | 'createdAt';
type SortDir = 'asc' | 'desc';
const sortKey = ref<SortKey>('name');
const sortDir = ref<SortDir>('asc');

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
}

function sortIcon(key: SortKey) {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

const sortedManagers = computed(() => {
  return [...managers.value].sort((a, b) => {
    const av = managerSortValue(a, sortKey.value);
    const bv = managerSortValue(b, sortKey.value);
    const dir = sortDir.value === 'asc' ? 1 : -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
});

function managerSortValue(manager: ManagerSummary, key: SortKey): string | number {
  switch (key) {
    case 'decisionInterval':
      return manager.config?.decisionInterval ?? '';
    case 'agentCount':
      return manager.agentCount ?? 0;
    case 'name':
      return manager.name;
    case 'status':
      return manager.status;
    case 'createdAt':
      return manager.createdAt;
  }
}

function managerEmoji(m: ManagerSummary) {
  const configProfileId = m.config?.profileId;
  const profileId = m.profileId ?? configProfileId ?? DEFAULT_MANAGER_PROFILE_ID;
  return getManagerProfile(profileId)?.emoji ?? '🧠';
}

function badgeClass(status: string) {
  return {
    'badge-running': status === 'running',
    'badge-paused': status === 'paused',
    'badge-stopped': status === 'stopped',
  };
}

function shortModel(llmModel?: string) {
  if (!llmModel) return '—';
  return llmModel.split('/').pop()?.replace(':free', '') ?? llmModel;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<style scoped>
.manager-table-row {
  cursor: pointer;
  transition: background 0.12s;
}
.manager-table-row:hover {
  background: var(--bg-hover);
}
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover { color: var(--text); }
.sort-icon {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 2px;
}
</style>
