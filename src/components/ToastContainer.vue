<template>
  <div class="toast-container">
    <transition-group name="toast" tag="div" class="toast-stack">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        @click="removeToast(t.id)"
      >
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { toasts, removeToast } from '@/utils/toast'
</script>

<style lang="scss" scoped>
.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast-enter-active {
  animation: slideInRight 0.3s ease;
}
.toast-leave-active {
  animation: slideInRight 0.2s ease reverse;
}
</style>
