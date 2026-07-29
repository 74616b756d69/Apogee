import { useRef, useEffect } from 'react'

function EventFormSheet({
  editingEvent, form, setForm, collections,
  submitting, deleting, submitError,
  onSubmit, onDelete, onClose,
}) {
  const titleRef = useRef(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [])

  return (
    <div
      className="cal-sheet-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cal-sheet">
        <div className="cal-sheet-handle" />
        <div className="cal-sheet-header">
          <p className="cal-sheet-title">{editingEvent ? '予定を編集' : '新しい予定'}</p>
          <button className="cal-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="cal-form">
          <input
            ref={titleRef}
            className="cal-input cal-input--title"
            placeholder="タイトルを入力"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
          />

          {collections.length > 0 && (
            <div className="cal-field">
              <label className="cal-field-label">カレンダー</label>
              <div className="cal-collection-list">
                {collections.map(c => (
                  <button
                    key={c.name}
                    className={`cal-collection-chip${form.calendarName === c.name ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, calendarName: c.name }))}
                  >
                    <span className="cal-collection-dot" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="cal-field">
            <label className="cal-field-label">日付</label>
            <input
              className="cal-input cal-input--date"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="cal-field">
            <div className="cal-allday-row">
              <label className="cal-field-label" style={{ marginBottom: 0 }}>時間</label>
              <label className="cal-toggle-switch">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                />
                <span className="cal-toggle-track" />
                <span className="cal-toggle-text">終日</span>
              </label>
            </div>
            {!form.allDay && (
              <div className="cal-time-row">
                <div className="cal-time-field">
                  <span className="cal-time-label">開始</span>
                  <input
                    className="cal-input cal-input--time"
                    type="time"
                    step="300"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <span className="cal-time-arrow">→</span>
                <div className="cal-time-field">
                  <span className="cal-time-label">終了</span>
                  <input
                    className="cal-input cal-input--time"
                    type="time"
                    step="300"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {submitError && <p className="cal-error">{submitError}</p>}
          <div className="cal-form-actions">
            <button
              className="cal-submit-btn"
              onClick={onSubmit}
              disabled={submitting || deleting || !form.title.trim() || !form.date}
            >
              {submitting ? (editingEvent ? '更新中...' : '追加中...') : (editingEvent ? '更新' : '追加')}
            </button>
            {editingEvent && (
              <button
                className="cal-delete-btn"
                onClick={onDelete}
                disabled={deleting || submitting}
              >
                {deleting ? '削除中...' : '削除'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EventFormSheet
