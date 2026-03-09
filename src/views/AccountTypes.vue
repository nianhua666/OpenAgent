<template>
  <div class="account-types">
    <div class="page-header">
      <h2>账号类型管理</h2>
      <button class="btn btn-primary" @click="openCreateDialog">
        <svg width="16" height="16"><use href="#icon-plus"/></svg>
        新建类型
      </button>
    </div>

    <!-- 类型卡片列表 -->
    <div class="type-grid" v-if="filteredTypes.length">
      <div class="type-card glass-card" v-for="type in filteredTypes" :key="type.id">
        <div class="type-card-header">
          <span class="type-color" :style="{ background: type.color }"></span>
          <h3>{{ type.name }}</h3>
          <div class="type-actions">
            <button class="btn btn-ghost btn-sm" @click="openEditDialog(type)" title="编辑">
              <svg width="14" height="14"><use href="#icon-edit"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" @click="confirmDelete(type)" title="删除">
              <svg width="14" height="14"><use href="#icon-trash"/></svg>
            </button>
          </div>
        </div>

        <div class="type-fields">
          <span class="field-tag" v-for="f in type.fields" :key="f.key">
            {{ f.name }}
            <span v-if="f.required" class="required-star">*</span>
          </span>
        </div>

        <div class="type-meta">
          <div class="meta-row">
            <span class="meta-label">导入分隔符：</span>
            <code>{{ type.importSeparator || '(无)' }}</code>
          </div>
          <div class="meta-row">
            <span class="meta-label">导出分隔符：</span>
            <code>{{ type.exportSeparator || '(无)' }}</code>
          </div>
          <div class="meta-row">
            <span class="meta-label">账号分隔：</span>
            <code>{{ type.accountSeparator === '\n' ? '换行' : type.accountSeparator || '换行' }}</code>
          </div>
        </div>

        <div class="type-card-footer">
          <router-link :to="`/accounts/list/${type.id}`" class="btn btn-secondary btn-sm">
            查看账号
          </router-link>
          <router-link :to="`/import/${type.id}`" class="btn btn-secondary btn-sm">
            导入
          </router-link>
          <router-link :to="`/export/${type.id}`" class="btn btn-secondary btn-sm">
            导出
          </router-link>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <svg width="64" height="64"><use href="#icon-types"/></svg>
      <div class="empty-title">{{ normalizedSearchQuery ? '未找到匹配类型' : '暂无账号类型' }}</div>
      <div class="empty-desc">{{ normalizedSearchQuery ? '请尝试更换搜索关键词' : '创建你的第一个账号类型来开始使用' }}</div>
    </div>

    <!-- 创建/编辑对话框 -->
    <div class="modal-mask" v-if="showDialog" @click.self="closeDialog">
      <div class="modal-content" style="max-width:640px">
        <div class="modal-header">
          <h3>{{ isEditing ? '编辑账号类型' : '新建账号类型' }}</h3>
          <button class="btn btn-ghost btn-sm" @click="closeDialog">
            <svg width="16" height="16"><use href="#icon-close"/></svg>
          </button>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>类型名称 *</label>
            <input class="input" v-model="form.name" placeholder="例如：Google 账号" maxlength="30" />
          </div>

          <div class="form-group">
            <label>标识颜色</label>
            <div class="color-picker">
              <button
                v-for="c in presetColors"
                :key="c"
                class="color-btn"
                :class="{ active: form.color === c }"
                :style="{ background: c }"
                @click="form.color = c"
              ></button>
            </div>
          </div>

          <!-- 字段定义 -->
          <div class="form-group" style="grid-column: 1/-1">
            <label>字段定义 *（至少一个）</label>
            <div class="field-list">
              <div class="field-row" v-for="(field, idx) in form.fields" :key="idx">
                <input class="input" v-model="field.name" placeholder="字段名称" style="flex:1" />
                <input class="input" v-model="field.key" placeholder="字段标识(英文)" style="flex:1" />
                <label class="checkbox">
                  <input type="checkbox" v-model="field.required" />
                  必填
                </label>
                <button class="btn btn-ghost btn-sm" @click="removeField(idx)" :disabled="form.fields.length <= 1">
                  <svg width="14" height="14"><use href="#icon-close"/></svg>
                </button>
              </div>
              <button class="btn btn-secondary btn-sm" @click="addField">
                <svg width="14" height="14"><use href="#icon-plus"/></svg>
                添加字段
              </button>
            </div>
          </div>

          <!-- 分隔符设置 -->
          <div class="form-group">
            <label>导入字段分隔符</label>
            <input class="input" v-model="form.importSeparator" placeholder="例如: - 或 : 或 |" />
            <span class="form-hint">字段之间的分隔字符，留空则整行为第一个字段</span>
          </div>

          <div class="form-group">
            <label>导出字段分隔符</label>
            <input class="input" v-model="form.exportSeparator" placeholder="例如: - 或 : 或 |" />
          </div>

          <div class="form-group">
            <label>导入账号分隔符</label>
            <input class="input" v-model="form.accountSeparator" placeholder="默认换行（留空即为换行）" />
            <span class="form-hint">不同账号之间的分隔方式，留空默认换行分隔</span>
          </div>

          <div class="form-group">
            <label>导出账号分隔符</label>
            <input class="input" v-model="form.exportAccountSeparator" placeholder="默认换行" />
          </div>
        </div>

        <!-- 导入预览示例 -->
        <div class="preview-box" v-if="form.fields.length">
          <label>导入格式预览：</label>
          <code>{{ importPreview }}</code>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeDialog">取消</button>
          <button class="btn btn-primary" @click="saveType" :disabled="!isFormValid">
            {{ isEditing ? '保存修改' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div class="modal-mask" v-if="showDeleteConfirm" @click.self="showDeleteConfirm = false">
      <div class="modal-content" style="max-width:400px">
        <h3 style="margin-bottom:12px">确认删除</h3>
        <p style="color:var(--text-secondary);margin-bottom:20px">
          确定要删除类型「{{ deleteTarget?.name }}」吗？该类型下的所有账号数据也将被删除，此操作不可撤销。
        </p>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="doDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { showToast } from '@/utils/toast'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import type { AccountType, AccountField } from '@/types'

const props = defineProps<{ searchQuery?: string }>()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()

const showDialog = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const showDeleteConfirm = ref(false)
const deleteTarget = ref<AccountType | null>(null)

const presetColors = [
  '#e8789a', '#b06ab3', '#5b9bd5', '#4ecdc4', '#45b088',
  '#f0a050', '#e85d75', '#9b6dff', '#6ec1e4', '#ff6b9d'
]

const defaultForm = () => ({
  name: '',
  color: presetColors[0],
  icon: '',
  fields: [{ key: 'account', name: '账号', required: true }] as AccountField[],
  importSeparator: '-',
  exportSeparator: '-',
  accountSeparator: '\n',
  exportAccountSeparator: '\n'
})

const form = reactive(defaultForm())
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const filteredTypes = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return typeStore.typeList
  }

  return typeStore.typeList.filter(type => matchesSearchQuery(
    query,
    type.name,
    type.fields,
    type.importSeparator,
    type.exportSeparator,
    type.accountSeparator,
    type.exportAccountSeparator
  ))
})

function resetForm() {
  Object.assign(form, defaultForm())
}

function openCreateDialog() {
  resetForm()
  isEditing.value = false
  editingId.value = ''
  showDialog.value = true
}

function openEditDialog(type: AccountType) {
  form.name = type.name
  form.color = type.color
  form.icon = type.icon
  form.fields = JSON.parse(JSON.stringify(type.fields))
  form.importSeparator = type.importSeparator
  form.exportSeparator = type.exportSeparator
  form.accountSeparator = type.accountSeparator
  form.exportAccountSeparator = type.exportAccountSeparator
  isEditing.value = true
  editingId.value = type.id
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
}

function addField() {
  form.fields.push({ key: '', name: '', required: false })
}

function removeField(idx: number) {
  if (form.fields.length > 1) {
    form.fields.splice(idx, 1)
  }
}

const isFormValid = computed(() => {
  return form.name.trim() &&
    form.fields.length > 0 &&
    form.fields.every(f => f.name.trim() && f.key.trim())
})

const importPreview = computed(() => {
  const sep = form.importSeparator || ''
  const fields = form.fields.map(f => `[${f.name}]`)
  return fields.join(sep)
})

async function saveType() {
  if (!isFormValid.value) return
  const data = {
    name: form.name.trim(),
    color: form.color,
    icon: form.icon,
    fields: form.fields.map(f => ({
      key: f.key.trim(),
      name: f.name.trim(),
      required: f.required
    })),
    importSeparator: form.importSeparator,
    exportSeparator: form.exportSeparator,
    accountSeparator: form.accountSeparator || '\n',
    exportAccountSeparator: form.exportAccountSeparator || '\n'
  }

  if (isEditing.value) {
    await typeStore.updateType(editingId.value, data)
    showToast('success', '账号类型已更新')
  } else {
    await typeStore.addType(data)
    showToast('success', `账号类型「${data.name}」创建成功`)
  }
  closeDialog()
}

function confirmDelete(type: AccountType) {
  deleteTarget.value = type
  showDeleteConfirm.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  await accountStore.removeTypeData(deleteTarget.value.id)
  await typeStore.removeType(deleteTarget.value.id)
  showToast('success', '账号类型已删除')
  showDeleteConfirm.value = false
  deleteTarget.value = null
}
</script>

<style lang="scss" scoped>
.account-types {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    font-size: $font-xl;
    font-weight: 700;
    color: var(--text-primary);
  }
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: $spacing-lg;
}

.type-card {
  padding: $spacing-lg;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.type-card-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;

  .type-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  h3 {
    flex: 1;
    font-size: $font-md;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.type-actions {
  display: flex;
  gap: 2px;
}

.type-fields {
  display: flex;
  gap: $spacing-xs;
  flex-wrap: wrap;
}

.field-tag {
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--primary-bg);
  color: var(--primary);
  font-size: $font-xs;
  font-weight: 500;

  .required-star {
    color: var(--danger);
  }
}

.type-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-xs;
  color: var(--text-muted);

  code {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-input);
    font-size: $font-xs;
    color: var(--text-secondary);
  }
}

.type-card-footer {
  display: flex;
  gap: $spacing-sm;
  margin-top: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-lg;

  h3 {
    font-size: $font-lg;
    font-weight: 600;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md;
}

.color-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    border-color: var(--text-primary);
    transform: scale(1.15);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  &:hover {
    transform: scale(1.1);
  }
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.field-row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.preview-box {
  margin-top: $spacing-md;
  padding: $spacing-md;
  border-radius: $border-radius-sm;
  background: var(--bg-input);

  label {
    font-size: $font-xs;
    color: var(--text-muted);
    display: block;
    margin-bottom: $spacing-xs;
  }

  code {
    font-size: $font-sm;
    color: var(--primary);
    word-break: break-all;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
  margin-top: $spacing-lg;
}
</style>
