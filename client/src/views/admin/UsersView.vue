<script setup lang="ts">
import LoadingPlaceholder from '../../components/LoadingPlaceholder.vue'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '../../api/admin'
import { useApiError } from '../../composables/useApiError'
import type { AdminUser, CreateUserData, UpdateUserData } from '../../api/admin'

const { t } = useI18n()
const { apiErrorMessage } = useApiError()

const users = ref<AdminUser[]>([])
const loading = ref(true)
const error = ref('')
const showForm = ref(false)
const editingUser = ref<AdminUser | null>(null)

// Form state
const form = ref({
  username: '',
  password: '',
  displayName: '',
  email: '',
  isAdmin: false,
})

onMounted(() => fetchUsers())

async function fetchUsers() {
  loading.value = true
  error.value = ''
  try {
    users.value = await adminApi.listUsers()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.loadUsersFailed')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingUser.value = null
  form.value = { username: '', password: '', displayName: '', email: '', isAdmin: false }
  showForm.value = true
}

function openEdit(user: AdminUser) {
  editingUser.value = user
  form.value = {
    username: user.username,
    password: '',
    displayName: user.displayName,
    email: user.email ?? '',
    isAdmin: user.isAdmin,
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingUser.value = null
}

async function submitForm() {
  error.value = ''
  try {
    if (editingUser.value) {
      const data: UpdateUserData = {
        displayName: form.value.displayName,
        email: form.value.email || undefined,
        isAdmin: form.value.isAdmin,
      }
      if (form.value.password) {
        data.password = form.value.password
      }
      await adminApi.updateUser(editingUser.value.id, data)
    } else {
      const data: CreateUserData = {
        username: form.value.username,
        password: form.value.password,
        displayName: form.value.displayName,
        email: form.value.email || undefined,
        isAdmin: form.value.isAdmin,
      }
      await adminApi.createUser(data)
    }
    closeForm()
    await fetchUsers()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.userOperationFailed')
  }
}

async function deleteUser(user: AdminUser) {
  if (!confirm(t('admin.users.deleteConfirm', { username: user.username }))) return
  error.value = ''
  try {
    await adminApi.deleteUser(user.id)
    await fetchUsers()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.deleteUserFailed')
  }
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-display text-xl font-semibold text-ink">{{ $t('admin.users.title') }}</h2>
      <button
        @click="openCreate"
        class="btn btn-primary"
      >
        {{ $t('admin.users.add') }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">
      {{ error }}
    </div>

    <!-- Loading -->
    <LoadingPlaceholder v-if="loading" :count="3" />

    <!-- Form Modal -->
    <div v-if="showForm" class="mb-4 card p-6">
      <h3 class="mb-4 font-display text-base font-semibold text-ink">
        {{ editingUser ? $t('admin.users.editHeading') : $t('admin.users.createHeading') }}
      </h3>
      <form @submit.prevent="submitForm" class="space-y-3">
        <div v-if="!editingUser">
          <label class="field-label">{{ $t('admin.users.username') }}</label>
          <input
            v-model="form.username"
            type="text"
            required
            class="field-input mt-1"
          />
        </div>
        <div>
          <label class="field-label">{{ $t('admin.users.displayName') }}</label>
          <input
            v-model="form.displayName"
            type="text"
            required
            class="field-input mt-1"
          />
        </div>
        <div>
          <label class="field-label">{{ $t('admin.users.email') }}</label>
          <input
            v-model="form.email"
            type="email"
            class="field-input mt-1"
          />
        </div>
        <div>
          <label class="field-label">
            {{ $t('admin.users.password') }}
            {{ editingUser ? $t('admin.users.passwordKeepCurrent') : '' }}
          </label>
          <input
            v-model="form.password"
            type="password"
            :required="!editingUser"
            minlength="8"
            class="field-input mt-1"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="form.isAdmin"
            type="checkbox"
            id="isAdmin"
            class="size-4 rounded-sm border-line-strong text-primary-700 focus:ring-primary-400"
          />
          <label for="isAdmin" class="text-sm text-ink-muted">{{ $t('admin.users.administrator') }}</label>
        </div>
        <div class="flex gap-2 pt-2">
          <button
            type="submit"
            class="btn btn-primary"
          >
            {{ editingUser ? $t('common.save') : $t('common.create') }}
          </button>
          <button
            type="button"
            @click="closeForm"
            class="btn btn-quiet"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </form>
    </div>

    <!-- Users Table -->
    <div v-if="!loading" class="card overflow-hidden">
      <table class="min-w-full divide-y divide-line">
        <thead class="bg-surface-sunk">
          <tr>
            <th class="section-label px-4 py-3 text-left">{{ $t('admin.users.username') }}</th>
            <th class="section-label px-4 py-3 text-left">{{ $t('admin.users.displayName') }}</th>
            <th class="section-label px-4 py-3 text-left">{{ $t('admin.users.email') }}</th>
            <th class="section-label px-4 py-3 text-left">{{ $t('admin.users.role') }}</th>
            <th class="section-label px-4 py-3 text-left">{{ $t('admin.users.authMethod') }}</th>
            <th class="section-label px-4 py-3 text-right">{{ $t('admin.users.actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="user in users" :key="user.id" class="transition-colors hover:bg-surface-sunk">
            <td class="px-4 py-3 text-sm font-semibold text-ink">{{ user.username }}</td>
            <td class="px-4 py-3 text-sm text-ink-muted">{{ user.displayName }}</td>
            <td class="px-4 py-3 text-sm text-ink-muted">{{ user.email || $t('admin.users.none') }}</td>
            <td class="px-4 py-3">
              <span
                :class="
                  user.isAdmin
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-idle-soft text-idle-ink'
                "
                class="badge"
              >
                {{ user.isAdmin ? $t('admin.users.roleAdmin') : $t('admin.users.roleUser') }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-ink-faint">
              {{ user.oidcSubject ? $t('admin.users.authOidc') : $t('admin.users.authLocal') }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                @click="openEdit(user)"
                class="mr-3 text-xs font-semibold text-primary-700 hover:underline"
              >
                {{ $t('common.edit') }}
              </button>
              <button
                @click="deleteUser(user)"
                class="text-xs font-semibold text-overdue-ink hover:underline"
              >
                {{ $t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-sm text-ink-faint">{{ $t('admin.users.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
