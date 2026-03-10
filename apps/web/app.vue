<script setup lang="ts">
import { useAppKit } from '@reown/appkit/vue';
import { useAccount } from '@wagmi/vue';

// Feature flag — set to false to remove the beta badge sitewide
const IS_BETA = true;

const { user, isAuthenticated } = useAuth();
const { open: openAppKit } = useAppKit();
const { isConnected, address } = useAccount();

useHead({
  htmlAttrs: { lang: 'en' },
});

function truncate(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
</script>

<template>
  <div>
    <nav class="navbar">
      <NuxtLink to="/" class="navbar-brand">
        <span class="dot" />
        Heppy Market
        <span v-if="IS_BETA" class="beta-badge">Beta</span>
      </NuxtLink>
      <div class="navbar-nav">
        <template v-if="isAuthenticated">
          <NuxtLink to="/">Dashboard</NuxtLink>
          <NuxtLink to="/agents">Agents</NuxtLink>
          <NuxtLink to="/managers">Managers</NuxtLink>
          <NuxtLink to="/trades">Trades</NuxtLink>
        </template>
      </div>
      <div class="navbar-auth">
        <template v-if="isAuthenticated && user">
          <NuxtLink v-if="isAuthenticated" to="/settings" class="settings-icon-btn" title="Settings">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.3"/>
              <path d="M12.03 8.91a4.87 4.87 0 0 0 .04-.41c0-.14-.01-.28-.04-.41l.9-.7a.22.22 0 0 0 .05-.28l-.85-1.47a.22.22 0 0 0-.27-.1l-1.06.43a4.6 4.6 0 0 0-.7-.41l-.16-1.12a.21.21 0 0 0-.22-.19H8.3a.21.21 0 0 0-.22.19l-.16 1.12a4.6 4.6 0 0 0-.7.41l-1.06-.43a.22.22 0 0 0-.27.1L5.04 7.11a.22.22 0 0 0 .05.28l.9.7c-.03.13-.04.27-.04.41s.01.28.04.41l-.9.7a.22.22 0 0 0-.05.28l.85 1.47c.06.1.18.14.27.1l1.06-.43c.22.15.46.29.7.41l.16 1.12c.03.11.12.19.22.19h1.72c.1 0 .19-.08.22-.19l.16-1.12c.24-.12.48-.26.7-.41l1.06.43c.1.04.21 0 .27-.1l.85-1.47a.22.22 0 0 0-.05-.28l-.9-.7Z" stroke="currentColor" stroke-width="1.3"/>
            </svg>
          </NuxtLink>
          <button
            type="button"
            class="wallet-trigger"
            @click="openAppKit({ view: 'Account' })"
          >
            <span class="wallet-dot" />
            {{ truncate(user.walletAddress) }}
            <span
              v-if="user.authProvider && user.authProvider !== 'wallet'"
              class="provider-badge"
              :title="`Signed in with ${user.authProvider}`"
            >{{ user.authProvider }}</span>
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="wallet-trigger"
            @click="openAppKit(isConnected ? { view: 'Account' } : undefined)"
          >
            <span
              class="wallet-dot"
              :class="{ 'wallet-dot--disconnected': !isConnected }"
            />
            <span v-if="isConnected && address">
              {{ truncate(address) }}
            </span>
            <span v-else>
              Connect
            </span>
          </button>
        </template>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>

<style>
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  height: 56px;
}

.navbar-brand {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.navbar-nav {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 1rem;
}

.navbar-nav a {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.navbar-nav a:hover,
.navbar-nav a.router-link-active {
  background: var(--bg-hover);
  color: var(--text);
}

.navbar-auth {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.beta-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid var(--accent-dim);
  margin-left: 2px;
}

.wallet-trigger {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.wallet-trigger:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.wallet-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success, #22c55e);
  flex-shrink: 0;
}

.wallet-dot--disconnected {
  background: var(--text-dim);
}

.provider-badge {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--accent-dim);
  color: var(--accent);
  text-transform: capitalize;
  font-family: 'Inter', sans-serif;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.75rem;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.settings-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  margin-right: 8px;
  transition: background 0.15s, color 0.15s;
}
.settings-icon-btn:hover {
  background: var(--bg-secondary);
  color: var(--text);
}
</style>
