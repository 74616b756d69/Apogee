// /api/tasks への薄いクライアント。実体は Apple リマインダー (CalDAV VTODO)。

import { request } from './http'

/** filter: open(既定) | today | overdue | upcoming | completed | all */
export function fetchTasks(filter = 'open') {
  return request(`/api/tasks?filter=${encodeURIComponent(filter)}`, { cache: 'no-store' })
}

/** リマインダーリスト一覧（name / color）。 */
export function fetchTaskLists() {
  return request('/api/tasks/lists')
}

export function createTask({ title, dueDate, priority, calendarName }) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, dueDate, priority, calendarName }),
  })
}

/**
 * 部分更新。渡さなかったフィールドは変更されない。
 * 期限や時間ブロックを解除する場合は空文字を渡す。
 */
export function updateTask(rawUid, patch) {
  return request(`/api/tasks/${encodeURIComponent(rawUid)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteTask(rawUid) {
  return request(`/api/tasks/${encodeURIComponent(rawUid)}`, { method: 'DELETE' })
}
