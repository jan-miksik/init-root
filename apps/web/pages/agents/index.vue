<script setup lang="ts">
import { getAgentProfile, DEFAULT_AGENT_PROFILE_ID } from '@dex-agents/shared';

definePageMeta({ ssr: false });
const { agents, loading, error, fetchAgents, createAgent, startAgent, stopAgent, deleteAgent, updateAgent } = useAgents();
const router = useRouter();

const userAgents = computed(() => agents.value.filter((a) => !a.managerId));
const managedAgents = computed(() => agents.value.filter((a) => !!a.managerId));

const showCreateModal = ref(false);
const creating = ref(false);
const createError = ref('');

const editingAgent = ref<(typeof agents.value)[0] | null>(null);
const showEditModal = ref(false);
const saving = ref(false);
const saveError = ref('');

// View mode: table (default) or grid
const viewMode = ref<'table' | 'grid'>('table');

// Sorting
type SortKey = 'name' | 'status' | 'autonomyLevel' | 'analysisInterval' | 'paperBalance' | 'maxPositionSizePct';
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

function sortedList(list: typeof agents.value) {
  return [...list].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey.value === 'analysisInterval') {
      av = a.config.analysisInterval;
      bv = b.config.analysisInterval;
    } else if (sortKey.value === 'paperBalance') {
      av = a.config.paperBalance;
      bv = b.config.paperBalance;
    } else if (sortKey.value === 'maxPositionSizePct') {
      av = a.config.maxPositionSizePct;
      bv = b.config.maxPositionSizePct;
    } else {
      av = (a as any)[sortKey.value] ?? '';
      bv = (b as any)[sortKey.value] ?? '';
    }
    const dir = sortDir.value === 'asc' ? 1 : -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

const sortedUserAgents = computed(() => sortedList(userAgents.value));
const sortedManagedAgents = computed(() => sortedList(managedAgents.value));

function agentEmoji(agent: (typeof agents.value)[0]) {
  const configProfileId = (agent.config as { profileId?: string }).profileId;
  const profileId = agent.profileId ?? configProfileId ?? DEFAULT_AGENT_PROFILE_ID;
  return getAgentProfile(profileId)?.emoji ?? '🤖';
}

onMounted(fetchAgents);

async function handleCreate(payload: Parameters<typeof createAgent>[0]) {
  creating.value = true;
  createError.value = '';
  try {
    const agent = await createAgent(payload);
    try {
      await startAgent(agent.id);
    } catch {
      console.warn('Agent created but failed to auto-start');
    }
    showCreateModal.value = false;
    router.push(`/agents/${agent.id}`);
  } catch (e) {
    createError.value = extractApiError(e);
  } finally {
    creating.value = false;
  }
}

async function handleDelete(id: string) {
  if (!confirm('Delete this agent? This cannot be undone.')) return;
  try {
    await deleteAgent(id);
  } catch (e) {
    alert(`Failed to delete: ${extractApiError(e)}`);
  }
}

function handleEditClick(id: string) {
  const found = agents.value.find((a) => a.id === id) ?? null;
  editingAgent.value = found;
  saveError.value = '';
  showEditModal.value = true;
}

async function handleEditSubmit(payload: Parameters<typeof updateAgent>[1]) {
  if (!editingAgent.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    await updateAgent(editingAgent.value.id, payload);
    showEditModal.value = false;
    editingAgent.value = null;
  } catch (e) {
    saveError.value = extractApiError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Trading Agents</h1>
        <p class="page-subtitle">{{ agents.length }} agents · {{ agents.filter(a => a.status === 'running').length }} running<span v-if="managedAgents.length"> · {{ managedAgents.length }} managed</span></p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <!-- View toggle -->
        <div class="view-toggle">
          <button :class="['toggle-btn', { active: viewMode === 'table' }]" title="Table view" @click="viewMode = 'table'">☰</button>
          <button :class="['toggle-btn', { active: viewMode === 'grid' }]" title="Grid view" @click="viewMode = 'grid'">⊞</button>
        </div>
        <button class="btn btn-primary" @click="showCreateModal = true">
          + New Agent
        </button>
      </div>
    </div>

    <div v-if="loading" style="text-align: center; padding: 48px;">
      <span class="spinner" />
    </div>

    <div v-else-if="error" class="alert alert-error">{{ error }}</div>

    <div v-else-if="agents.length === 0" class="empty-state">
      <div class="empty-icon">🤖</div>
      <div class="empty-title">No agents yet</div>
      <p>Create your first AI trading agent to get started.</p>
      <button class="btn btn-primary" style="margin-top: 16px;" @click="showCreateModal = true">
        Create Agent
      </button>
    </div>

    <!-- TABLE VIEW -->
    <div v-else-if="viewMode === 'table'">
      <!-- User-created agents -->
      <div v-if="userAgents.length > 0">
        <div v-if="managedAgents.length > 0" class="section-header">Your agents</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 32px;"></th>
                <th class="sortable" @click="toggleSort('name')">Name <span class="sort-icon">{{ sortIcon('name') }}</span></th>
                <th class="sortable" @click="toggleSort('status')">Status <span class="sort-icon">{{ sortIcon('status') }}</span></th>
                <th class="sortable" @click="toggleSort('autonomyLevel')">Autonomy <span class="sort-icon">{{ sortIcon('autonomyLevel') }}</span></th>
                <th>Pairs</th>
                <th>Model</th>
                <th class="sortable" @click="toggleSort('analysisInterval')">Interval <span class="sort-icon">{{ sortIcon('analysisInterval') }}</span></th>
                <th class="sortable" @click="toggleSort('paperBalance')">Balance <span class="sort-icon">{{ sortIcon('paperBalance') }}</span></th>
                <th class="sortable" @click="toggleSort('maxPositionSizePct')">Max Pos <span class="sort-icon">{{ sortIcon('maxPositionSizePct') }}</span></th>
                <th>SL / TP</th>
                <th style="text-align: right; white-space: nowrap;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="agent in sortedUserAgents"
                :key="agent.id"
                class="agent-table-row"
                @click="$router.push(`/agents/${agent.id}`)"
              >
                <td style="font-size: 18px; line-height: 1;">{{ agentEmoji(agent) }}</td>
                <td>
                  <span style="font-weight: 500; color: var(--text);">{{ agent.name }}</span>
                </td>
                <td><span class="badge" :class="`badge-${agent.status}`">{{ agent.status }}</span></td>
                <td style="color: var(--text-muted); font-size: 12px;">{{ agent.autonomyLevel }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.pairs.join(', ') }}</td>
                <td style="color: var(--text-muted); font-size: 12px;">{{ agent.llmModel.split('/')[1]?.replace(':free', '') ?? agent.llmModel }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.analysisInterval }}</td>
                <td class="mono" style="font-size: 12px;">${{ agent.config.paperBalance.toLocaleString() }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.maxPositionSizePct }}%</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.stopLossPct }}% / {{ agent.config.takeProfitPct }}%</td>
                <td style="text-align: right;" @click.stop>
                  <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button v-if="agent.status !== 'running'" class="btn btn-success btn-sm" @click="startAgent(agent.id)">▶</button>
                    <button v-else class="btn btn-ghost btn-sm" @click="stopAgent(agent.id)">■</button>
                    <button class="btn btn-ghost btn-sm" @click="handleEditClick(agent.id)">✎</button>
                    <button class="btn btn-danger btn-sm" @click="handleDelete(agent.id)">✕</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Manager-created agents -->
      <div v-if="managedAgents.length > 0" :style="userAgents.length > 0 ? 'margin-top: 28px;' : ''">
        <div class="section-header">
          <span>Managed by Agent Manager</span>
          <span class="section-count">{{ managedAgents.length }}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 32px;"></th>
                <th class="sortable" @click="toggleSort('name')">Name <span class="sort-icon">{{ sortIcon('name') }}</span></th>
                <th class="sortable" @click="toggleSort('status')">Status <span class="sort-icon">{{ sortIcon('status') }}</span></th>
                <th class="sortable" @click="toggleSort('autonomyLevel')">Autonomy <span class="sort-icon">{{ sortIcon('autonomyLevel') }}</span></th>
                <th>Pairs</th>
                <th>Model</th>
                <th class="sortable" @click="toggleSort('analysisInterval')">Interval <span class="sort-icon">{{ sortIcon('analysisInterval') }}</span></th>
                <th class="sortable" @click="toggleSort('paperBalance')">Balance <span class="sort-icon">{{ sortIcon('paperBalance') }}</span></th>
                <th class="sortable" @click="toggleSort('maxPositionSizePct')">Max Pos <span class="sort-icon">{{ sortIcon('maxPositionSizePct') }}</span></th>
                <th>SL / TP</th>
                <th style="text-align: right; white-space: nowrap;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="agent in sortedManagedAgents"
                :key="agent.id"
                class="agent-table-row"
                @click="$router.push(`/agents/${agent.id}`)"
              >
                <td style="font-size: 18px; line-height: 1;">{{ agentEmoji(agent) }}</td>
                <td>
                  <span style="font-weight: 500; color: var(--text);">{{ agent.name }}</span>
                  <span class="managed-tag">🧠</span>
                </td>
                <td><span class="badge" :class="`badge-${agent.status}`">{{ agent.status }}</span></td>
                <td style="color: var(--text-muted); font-size: 12px;">{{ agent.autonomyLevel }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.pairs.join(', ') }}</td>
                <td style="color: var(--text-muted); font-size: 12px;">{{ agent.llmModel.split('/')[1]?.replace(':free', '') ?? agent.llmModel }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.analysisInterval }}</td>
                <td class="mono" style="font-size: 12px;">${{ agent.config.paperBalance.toLocaleString() }}</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.maxPositionSizePct }}%</td>
                <td class="mono" style="font-size: 12px;">{{ agent.config.stopLossPct }}% / {{ agent.config.takeProfitPct }}%</td>
                <td style="text-align: right;" @click.stop>
                  <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button v-if="agent.status !== 'running'" class="btn btn-success btn-sm" @click="startAgent(agent.id)">▶</button>
                    <button v-else class="btn btn-ghost btn-sm" @click="stopAgent(agent.id)">■</button>
                    <button class="btn btn-ghost btn-sm" @click="handleEditClick(agent.id)">✎</button>
                    <button class="btn btn-danger btn-sm" @click="handleDelete(agent.id)">✕</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- GRID VIEW -->
    <div v-else>
      <div v-if="userAgents.length > 0">
        <div v-if="managedAgents.length > 0" class="section-header">Your agents</div>
        <div class="agents-grid">
          <AgentCard
            v-for="agent in userAgents"
            :key="agent.id"
            :agent="agent"
            @click="$router.push(`/agents/${agent.id}`)"
            @start="startAgent"
            @stop="stopAgent"
            @delete="handleDelete"
            @edit="handleEditClick"
          />
        </div>
      </div>
      <div v-if="managedAgents.length > 0" :style="userAgents.length > 0 ? 'margin-top: 28px;' : ''">
        <div class="section-header">
          <span>Managed by Agent Manager</span>
          <span class="section-count">{{ managedAgents.length }}</span>
        </div>
        <div class="agents-grid">
          <AgentCard
            v-for="agent in managedAgents"
            :key="agent.id"
            :agent="agent"
            @click="$router.push(`/agents/${agent.id}`)"
            @start="startAgent"
            @stop="stopAgent"
            @delete="handleDelete"
            @edit="handleEditClick"
          />
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Create Trading Agent</span>
            <button class="btn btn-ghost btn-sm" @click="showCreateModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div v-if="createError" class="alert alert-error">{{ createError }}</div>
            <AgentConfigForm
              @submit="handleCreate"
              @cancel="showCreateModal = false"
            />
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEditModal && editingAgent" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Edit Agent</span>
            <button class="btn btn-ghost btn-sm" @click="showEditModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div v-if="saveError" class="alert alert-error">{{ saveError }}</div>
            <AgentConfigForm
              :initialValues="{
                name: editingAgent.name,
                autonomyLevel: editingAgent.autonomyLevel,
                llmModel: editingAgent.llmModel,
                pairs: editingAgent.config.pairs,
                paperBalance: editingAgent.config.paperBalance,
                strategies: editingAgent.config.strategies,
                analysisInterval: editingAgent.config.analysisInterval,
                maxPositionSizePct: editingAgent.config.maxPositionSizePct,
                stopLossPct: editingAgent.config.stopLossPct,
                takeProfitPct: editingAgent.config.takeProfitPct,
                maxOpenPositions: editingAgent.config.maxOpenPositions,
                temperature: editingAgent.config.temperature ?? 0.7,
                allowFallback: editingAgent.config.allowFallback ?? false,
              }"
              @submit="handleEditSubmit"
              @cancel="showEditModal = false"
            />
          </div>
          <div v-if="editingAgent.status === 'running'" class="modal-bottom-warning">Agent is running — changes take effect on the next analysis cycle.</div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.view-toggle {
  display: flex;
  gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius, 6px);
  padding: 2px;
}
.toggle-btn {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.toggle-btn.active {
  background: var(--accent);
  color: #fff;
}
.agent-table-row {
  cursor: pointer;
  transition: background 0.12s;
}
.agent-table-row:hover {
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
.managed-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  font-size: 13px;
}
</style>
