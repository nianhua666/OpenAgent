// Toast 消息系统
import { ref } from 'vue'
import type { ToastMessage } from '@/types'
import { genId } from './helpers'

export const toasts = ref<ToastMessage[]>([])

export function showToast(type: ToastMessage['type'], message: string, duration = 3000) {
  const id = genId()
  toasts.value.push({ id, type, message, duration })
  if (duration > 0) {
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }
}

export function removeToast(id: string) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}
