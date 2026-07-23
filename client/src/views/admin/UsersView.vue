<script setup lang="ts">
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
      <h2 class="text-lg font-semibold text-gray-900">{{ $t('admin.users.title') }}</h2>
      <button
        @click="openCreate"
        class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500"
      >
        {{ $t('admin.users.add') }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>

    <!-- Form Modal -->
    <div v-if="showForm" class="mb-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h3 class="mb-4 text-sm font-semibold text-gray-900">
        {{ editingUser ? $t('admin.users.editHeading') : $t('admin.users.createHeading') }}
      </h3>
      <form @submit.prevent="submitForm" class="space-y-3">
        <div v-if="!editingUser">
          <label class="block text-xs font-medium text-gray-700">{{ $t('admin.users.username') }}</label>
          <input
            v-model="form.username"
            type="text"
            required
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700">{{ $t('admin.users.displayName') }}</label>
          <input
            v-model="form.displayName"
            type="text"
            required
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700">{{ $t('admin.users.email') }}</label>
          <input
            v-model="form.email"
            type="email"
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700">
            {{ $t('admin.users.password') }}
            {{ editingUser ? $t('admin.users.passwordKeepCurrent') : '' }}
          </label>
          <input
            v-model="form.password"
            type="password"
            :required="!editingUser"
            minlength="8"
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="form.isAdmin"
            type="checkbox"
            id="isAdmin"
            class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label for="isAdmin" class="text-sm text-gray-700">{{ $t('admin.users.administrator') }}</label>
        </div>
        <div class="flex gap-2 pt-2">
          <button
            type="submit"
            class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
          >
            {{ editingUser ? $t('common.save') : $t('common.create') }}
          </button>
          <button
            type="button"
            @click="closeForm"
            class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </form>
    </div>

    <!-- Users Table -->
    <div v-if="!loading" class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.username') }}</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.displayName') }}</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.email') }}</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.role') }}</th>
            <th class="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.authMethod') }}</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{{ $t('admin.users.actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ user.username }}</td>
            <td class="px-4 py-3 text-sm text-gray-600">{{ user.displayName }}</td>
            <td class="px-4 py-3 text-sm text-gray-600">{{ user.email || $t('admin.users.none') }}</td>
            <td class="px-4 py-3">
              <span
                :class="
                  user.isAdmin
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600'
                "
                class="rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {{ user.isAdmin ? $t('admin.users.roleAdmin') : $t('admin.users.roleUser') }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">
              {{ user.oidcSubject ? $t('admin.users.authOidc') : $t('admin.users.authLocal') }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                @click="openEdit(user)"
                class="mr-2 text-xs font-medium text-primary-600 hover:text-primary-800"
              >
                {{ $t('common.edit') }}
              </button>
              <button
                @click="deleteUser(user)"
                class="text-xs font-medium text-red-600 hover:text-red-800"
              >
                {{ $t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-sm text-gray-400">{{ $t('admin.users.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
