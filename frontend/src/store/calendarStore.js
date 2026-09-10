import { create } from 'zustand'
import * as api from '../api/calendarApi'
import { addDays, toDateKey, parseServerDateTime, toServerDateTime } from '../utils/calendarDates'

export const LAUNCH_COLOR = '#e06a3a'
export const DEFAULT_EVENT_COLOR = '#4a9eff'

/** サーバー DTO → 画面で扱う正規化イベント。日時は Date に変換しておく。 */
export function normalizeEvent(dto) {
  return {
    id: dto.uid,
    rawUid: dto.rawUid,
    title: dto.title || '（タイトルなし）',
    start: parseServerDateTime(dto.start),
    end: parseServerDateTime(dto.end),
    allDay: !!dto.allDay,
    calendarName: dto.calendarName || null,
    calendarColor: dto.calendarColor || DEFAULT_EVENT_COLOR,
    tagColor: dto.tagColor || null,
    location: dto.location || '',
    url: dto.url || '',
    notes: dto.notes || '',
    rrule: dto.rrule || null,
    recurring: !!dto.recurring,
    recurrenceId: dto.recurrenceId || null,
    overridden: !!dto.overridden,
    reminders: dto.reminders || [],
    etag: dto.etag || null,
    source: 'calendar',
  }
}

export function eventColor(event) {
  return event.tagColor || event.calendarColor || DEFAULT_EVENT_COLOR
}

/**
 * 書き込みペイロードを組み立てる。サーバーは null を「未設定」として扱い
 * 該当プロパティを消すため、変更しない項目も現在値を必ず載せる。
 */
export function toWritePayload(event, changes = {}) {
  const merged = { ...event, ...changes }
  return {
    title: merged.title ?? '',
    start: toServerDateTime(merged.start, merged.allDay),
    end: merged.end ? toServerDateTime(merged.end, merged.allDay) : null,
    allDay: !!merged.allDay,
    calendarName: merged.calendarName || null,
    location: merged.location || null,
    url: merged.url || null,
    notes: merged.notes || null,
    tagColor: merged.tagColor || null,
    rrule: merged.rrule || null,
    reminders: merged.reminders?.length ? merged.reminders : null,
    editScope: merged.editScope || null,
    recurrenceId: merged.recurrenceId || null,
    etag: merged.etag || null,
  }
}

function errorMessage(err, fallback) {
  if (err?.isConflict) return '他の端末で更新されています。再読み込みしました'
  return err?.message && !/^\d+$/.test(err.message) ? err.message : fallback
}

export const useCalendarStore = create((set, get) => ({
  events: [],
  loading: false,
  error: null,
  /** 現在ロード済みの期間 ["YYYY-MM-DD", "YYYY-MM-DD"(排他)] */
  loadedRange: null,

  collections: [],
  collectionsLoaded: false,

  launches: [],
  launchesUpdatedAt: null,

  // ── 表示設定 ─────────────────────────────────
  showLaunches: readPref('cal-show-launches', true),
  showWeekNumbers: readPref('cal-week-numbers', false),
  businessHoursEnabled: readPref('cal-business-hours', true),
  businessHours: readPref('cal-business-hours-range', { start: '08:00', end: '21:00' }),
  /** ドラッグのスナップ間隔（分）。Option 押下中は 5 分になる。 */
  snapMinutes: 15,

  setPref: (key, value) => {
    writePref(prefKeyOf(key), value)
    set({ [key]: value })
  },
  setSnapMinutes: minutes => {
    if (get().snapMinutes !== minutes) set({ snapMinutes: minutes })
  },

  // ── 取得 ────────────────────────────────────

  loadCollections: async () => {
    if (get().collectionsLoaded) return
    try {
      const json = await api.fetchCollections()
      set({ collections: Array.isArray(json) ? json : [], collectionsLoaded: true })
    } catch {
      set({ collectionsLoaded: true })
    }
  },

  loadRange: async (startKey, endKey, { force = false, quiet = false } = {}) => {
    const { loadedRange } = get()
    if (!force && loadedRange && loadedRange[0] === startKey && loadedRange[1] === endKey) return

    if (!quiet) set({ loading: true })
    set({ error: null })
    try {
      const json = await api.fetchEvents(startKey, endKey)
      set({
        events: (Array.isArray(json) ? json : []).map(normalizeEvent),
        loadedRange: [startKey, endKey],
      })
    } catch (err) {
      set({ error: errorMessage(err, 'カレンダーの取得に失敗しました') })
    } finally {
      set({ loading: false })
    }
  },

  /** 現在の期間を取り直す。書き込み後の同期に使う。 */
  refresh: async () => {
    const range = get().loadedRange
    if (!range) return
    await get().loadRange(range[0], range[1], { force: true, quiet: true })
  },

  loadLaunches: async () => {
    try {
      const json = await api.fetchUpcomingLaunches()
      set({ launches: Array.isArray(json) ? json : [], launchesUpdatedAt: new Date() })
    } catch {
      // 打ち上げ情報は補助的な表示なので、失敗しても既存の値を残す
    }
  },

  // ── 書き込み ─────────────────────────────────

  createEvent: async draft => {
    const optimistic = {
      ...draft,
      id: `optimistic-${Date.now()}`,
      rawUid: null,
      source: 'calendar',
      pending: true,
      calendarColor: colorOfCalendar(get().collections, draft.calendarName),
    }
    set(state => ({ events: [...state.events, optimistic] }))
    try {
      await api.createEvent(toWritePayload(draft))
      await get().refresh()
      return true
    } catch (err) {
      set(state => ({
        events: state.events.filter(e => e.id !== optimistic.id),
        error: errorMessage(err, '予定の作成に失敗しました'),
      }))
      return false
    }
  },

  /**
   * 変更を先に画面へ反映し、失敗したら元に戻す。
   * ドラッグ操作は連続して起きるため、往復を待たせない。
   */
  updateEvent: async (event, changes, editScope = null) => {
    const previous = get().events
    set(state => ({
      events: state.events.map(e => (e.id === event.id ? { ...e, ...changes, pending: true } : e)),
    }))
    try {
      await api.updateEvent(event.rawUid, toWritePayload(event, {
        ...changes,
        editScope,
        recurrenceId: editScope && editScope !== 'all' ? event.recurrenceId : null,
      }))
      await get().refresh()
      return true
    } catch (err) {
      set({ events: previous, error: errorMessage(err, '予定の更新に失敗しました') })
      if (err?.isConflict) await get().refresh()
      return false
    }
  },

  deleteEvent: async (event, editScope = 'all') => {
    const previous = get().events
    set(state => ({ events: state.events.filter(e => e.id !== event.id) }))
    try {
      await api.deleteEvent(event.rawUid, {
        calendarName: event.calendarName,
        recurrenceId: editScope !== 'all' ? event.recurrenceId : null,
        editScope,
      })
      await get().refresh()
      return true
    } catch (err) {
      set({ events: previous, error: errorMessage(err, '予定の削除に失敗しました') })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))

function colorOfCalendar(collections, name) {
  return collections.find(c => c.name === name)?.color || DEFAULT_EVENT_COLOR
}

const PREF_KEYS = {
  showLaunches: 'cal-show-launches',
  showWeekNumbers: 'cal-week-numbers',
  businessHoursEnabled: 'cal-business-hours',
  businessHours: 'cal-business-hours-range',
}

function prefKeyOf(stateKey) {
  return PREF_KEYS[stateKey] ?? stateKey
}

function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // プライベートブラウジング等で保存できなくても機能自体は動かす
  }
}

/** FullCalendar に渡す既定の表示期間（前後 1 ヶ月の余白付き）。 */
export function paddedRangeOf(start, end) {
  return [toDateKey(addDays(start, -7)), toDateKey(addDays(end, 7))]
}
