// /api/calendar への薄いクライアント。CSRF とエラー整形は http.js に共通化してある。

import { ApiError, request } from './http'

/** 既存の呼び出し側との互換のため名前を残す。実体は共通の ApiError。 */
export { ApiError as CalendarApiError }

/** 期間内のイベント。end は排他的。 */
export function fetchEvents(startKey, endKey) {
  return request(`/api/calendar/events?start=${startKey}&end=${endKey}`, { cache: 'no-store' })
}

export function fetchCollections() {
  return request('/api/calendar/collections')
}

export function createEvent(payload) {
  return request('/api/calendar/event', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateEvent(rawUid, payload) {
  return request(`/api/calendar/event/${encodeURIComponent(rawUid)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteEvent(rawUid, { calendarName, recurrenceId, editScope } = {}) {
  const params = new URLSearchParams()
  if (calendarName) params.set('calendarName', calendarName)
  if (recurrenceId) params.set('recurrenceId', recurrenceId)
  if (editScope) params.set('editScope', editScope)
  const query = params.toString()
  return request(
    `/api/calendar/event/${encodeURIComponent(rawUid)}${query ? `?${query}` : ''}`,
    { method: 'DELETE' },
  )
}

export function fetchUpcomingLaunches() {
  return request('/api/launches/upcoming', { cache: 'no-store' })
}
