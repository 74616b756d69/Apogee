export const MAX_LANES = 3

function eventIdentity(e) {
  if (e._type === 'launch') return `launch-${e.uid}`
  return `cal-${e.rawUid || e.uid}`
}

// 週(7日分)の日別イベントを、連続する日にまたがる1本のバーへと結合する。
// weekCells: [{ key: 'YYYY-MM-DD' | null }, ...] 長さ7
// dayCombinedEvents: { [dateKey]: Event[] }
export function computeWeekSpans(weekCells, dayCombinedEvents) {
  const perCol = weekCells.map(cell => (cell.key ? (dayCombinedEvents[cell.key] || []) : []))

  const openSpans = new Map()
  const finishedSpans = []

  for (let col = 0; col < weekCells.length; col++) {
    const idsThisCol = new Set(perCol[col].map(eventIdentity))

    for (const [id, span] of openSpans) {
      if (!idsThisCol.has(id)) {
        finishedSpans.push(span)
        openSpans.delete(id)
      }
    }

    for (const e of perCol[col]) {
      const id = eventIdentity(e)
      const existing = openSpans.get(id)
      if (existing) {
        existing.endCol = col
      } else {
        openSpans.set(id, {
          id,
          startCol: col,
          endCol: col,
          title: e.title,
          calendarColor: e.calendarColor,
          calendarName: e.calendarName,
          allDay: e.allDay,
          startTime: e.startTime,
          _type: e._type,
        })
      }
    }
  }
  for (const span of openSpans.values()) finishedSpans.push(span)

  finishedSpans.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))

  const laneEnds = []
  const overflow = []
  for (const span of finishedSpans) {
    let lane = laneEnds.findIndex(end => end < span.startCol)
    if (lane === -1) lane = laneEnds.length
    if (lane >= MAX_LANES) {
      overflow.push(span)
      continue
    }
    laneEnds[lane] = span.endCol
    span.lane = lane
  }

  const overflowByCol = {}
  for (const span of overflow) {
    for (let c = span.startCol; c <= span.endCol; c++) {
      overflowByCol[c] = (overflowByCol[c] || 0) + 1
    }
  }

  return { spans: finishedSpans.filter(s => s.lane !== undefined), overflowByCol }
}
