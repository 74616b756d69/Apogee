// /api/calendar への薄いクライアント。
// Spring Security の CSRF トークンは Cookie に入るので、書き込み系でヘッダに載せ替える。

function csrfHeaders() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {}
}

export class CalendarApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'CalendarApiError'
    this.status = status
    this.isConflict = status === 409
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeaders(),
      ...options.headers,
    },
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      // レスポンスが JSON でない場合はステータスだけで判断する
    }
    throw new CalendarApiError(message, res.status)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

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
