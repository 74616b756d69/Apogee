package com.space.service;

import com.space.dto.CalendarEventDto;
import net.fortuna.ical4j.model.DateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AppleCalendarServiceTest {

    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");

    private AppleCalendarService service;

    @BeforeEach
    void setUp() {
        service = new AppleCalendarService();
    }

    private net.fortuna.ical4j.model.Date toIcalDate(LocalDate date) {
        return new DateTime(java.util.Date.from(date.atStartOfDay(JST).toInstant()));
    }

    private List<CalendarEventDto> parse(String ics, String calName, String color,
                                         LocalDate from, LocalDate to) {
        return service.parseOccurrences(ics, calName, color, toIcalDate(from), toIcalDate(to));
    }

    @Test
    void parseSimpleTimedEvent() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:test-uid-1
                DTSTART;TZID=Asia/Tokyo:20250730T100000
                DTEND;TZID=Asia/Tokyo:20250730T110000
                SUMMARY:朝会
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate date = LocalDate.of(2025, 7, 30);
        List<CalendarEventDto> events = parse(ics, "仕事", "#FF0000", date, date.plusDays(1));

        assertEquals(1, events.size());
        CalendarEventDto event = events.get(0);
        assertEquals("朝会", event.getTitle());
        assertEquals("10:00", event.getStartTime());
        assertEquals("11:00", event.getEndTime(), "終了時刻が欠落しないこと");
        assertEquals("2025-07-30T10:00:00+09:00", event.getStart());
        assertEquals("2025-07-30T11:00:00+09:00", event.getEnd());
        assertFalse(event.isAllDay());
        assertEquals("仕事", event.getCalendarName());
        assertEquals("#FF0000", event.getCalendarColor());
        assertEquals("2025-07-30", event.getDate());
        assertTrue(event.getUid().contains("test-uid-1"));
        assertEquals("test-uid-1", event.getRawUid());
    }

    @Test
    void parseAllDayEvent() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:allday-uid
                DTSTART;VALUE=DATE:20250730
                DTEND;VALUE=DATE:20250731
                SUMMARY:終日イベント
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate date = LocalDate.of(2025, 7, 30);
        List<CalendarEventDto> events = parse(ics, "個人", null, date, date.plusDays(1));

        assertEquals(1, events.size());
        CalendarEventDto event = events.get(0);
        assertEquals("終日イベント", event.getTitle());
        assertTrue(event.isAllDay());
        assertNull(event.getStartTime());
        assertEquals("2025-07-30", event.getDate());
        assertEquals("2025-07-30", event.getStart());
        assertEquals("2025-07-31", event.getEnd(), "終日の end は排他的（翌日）であること");
    }

    @Test
    void multiDayEventStaysOneSpan() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:multiday-uid
                DTSTART;VALUE=DATE:20250728
                DTEND;VALUE=DATE:20250801
                SUMMARY:夏休み
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate from = LocalDate.of(2025, 7, 28);
        LocalDate to = LocalDate.of(2025, 8, 1);
        List<CalendarEventDto> events = parse(ics, "個人", "#00FF00", from, to);

        assertEquals(1, events.size(), "複数日イベントは1本のスパンとして保持されること");
        CalendarEventDto span = events.get(0);
        assertEquals("2025-07-28", span.getStart());
        assertEquals("2025-08-01", span.getEnd());
        assertEquals("2025-07-31", span.getEndDate(), "endDate は包含表現");
        assertTrue(span.isAllDay());
    }

    @Test
    void multiDayEventFansOutForLegacyDateKeyedApi() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:multiday-uid
                DTSTART;VALUE=DATE:20250728
                DTEND;VALUE=DATE:20250801
                SUMMARY:夏休み
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate from = LocalDate.of(2025, 7, 28);
        LocalDate to = LocalDate.of(2025, 8, 1);
        Map<String, List<CalendarEventDto>> byDate =
                service.fanOutByDate(parse(ics, "個人", "#00FF00", from, to), from, to);

        assertEquals(4, byDate.size());
        for (String key : List.of("2025-07-28", "2025-07-29", "2025-07-30", "2025-07-31")) {
            List<CalendarEventDto> day = byDate.get(key);
            assertNotNull(day, key + " に展開されること");
            assertEquals(1, day.size());
            assertEquals("夏休み", day.get(0).getTitle());
            assertTrue(day.get(0).isAllDay());
        }
    }

    @Test
    void parseEventOutsideRange() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:outside-uid
                DTSTART;TZID=Asia/Tokyo:20250801T100000
                DTEND;TZID=Asia/Tokyo:20250801T110000
                SUMMARY:範囲外
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate date = LocalDate.of(2025, 7, 30);
        assertTrue(parse(ics, "仕事", null, date, date.plusDays(1)).isEmpty());
    }

    @Test
    void parseEventWithNoSummary() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:nosummary-uid
                DTSTART;VALUE=DATE:20250730
                DTEND;VALUE=DATE:20250731
                END:VEVENT
                END:VCALENDAR
                """;

        LocalDate date = LocalDate.of(2025, 7, 30);
        List<CalendarEventDto> events = parse(ics, "個人", null, date, date.plusDays(1));

        assertEquals(1, events.size());
        assertEquals("（タイトルなし）", events.get(0).getTitle());
    }

    @Test
    void parseInvalidIcsReturnsEmpty() {
        assertTrue(parse("invalid data", "cal", null,
                LocalDate.of(2025, 7, 30), LocalDate.of(2025, 7, 31)).isEmpty());
    }

    @Test
    void parseRecurringWeeklyEvent() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:weekly-uid
                DTSTART;TZID=Asia/Tokyo:20250707T090000
                DTEND;TZID=Asia/Tokyo:20250707T100000
                RRULE:FREQ=WEEKLY;COUNT=5
                SUMMARY:週次ミーティング
                END:VEVENT
                END:VCALENDAR
                """;

        List<CalendarEventDto> events =
                parse(ics, "仕事", "#0000FF", LocalDate.of(2025, 7, 1), LocalDate.of(2025, 8, 1));

        assertTrue(events.size() >= 4);
        for (CalendarEventDto e : events) {
            assertEquals("週次ミーティング", e.getTitle());
            assertEquals("09:00", e.getStartTime());
            assertFalse(e.isAllDay());
            assertTrue(e.isRecurring(), "繰り返しフラグが立つこと");
            assertEquals("FREQ=WEEKLY;COUNT=5", e.getRrule());
            assertNotNull(e.getRecurrenceId(), "各回に RECURRENCE-ID の基準値が付くこと");
        }
        // 各回の recurrenceId は UTC 正準形で、回ごとに異なる
        assertEquals(events.size(), events.stream().map(CalendarEventDto::getRecurrenceId).distinct().count());
    }

    @Test
    void parseKoketsuAllDayTransparentEventWithNoneAlarm() {
        String ics = """
                BEGIN:VCALENDAR
                CALSCALE:GREGORIAN
                PRODID:-//Apple Inc.//macOS 26.5//EN
                VERSION:2.0
                BEGIN:VEVENT
                CREATED:20260709T121116Z
                DTEND;VALUE=DATE:20260801
                DTSTAMP:20260709T121117Z
                DTSTART;VALUE=DATE:20260701
                LAST-MODIFIED:20260709T121116Z
                SEQUENCE:0
                SUMMARY:公欠申請ずみ
                UID:0C354403-95D2-415A-B882-FF6C3224675C
                X-APPLE-CREATOR-IDENTITY:com.apple.calendar
                X-APPLE-CREATOR-TEAM-IDENTITY:0000000000
                TRANSP:TRANSPARENT
                BEGIN:VALARM
                ACTION:NONE
                TRIGGER;VALUE=DATE-TIME:19760401T005545Z
                END:VALARM
                END:VEVENT
                END:VCALENDAR
                """;

        List<CalendarEventDto> events =
                parse(ics, "その他日程", null, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 8, 1));

        assertFalse(events.isEmpty(), "公欠申請ずみイベントがパースされること");
        assertEquals("2026-07-01", events.get(0).getDate());
        assertTrue(events.get(0).getReminders().isEmpty(),
                "絶対日時トリガーは通知分数として解釈しないこと");
    }

    @Test
    void ignoresAppleRelatedToPropertyThatWouldOtherwiseDropTheEvent() {
        // Apple独自の RELATED-TO;RELTYPE=X-CALENDARSERVER-RECURRENCE-SET は
        // 行折り返し込みで存在すると、ical4jが例外も出さずVEVENTを丸ごと読み飛ばす。
        // 実データ(インターンの繰り返し予定)を再現し、除去処理で回復することを確認する。
        String ics = "BEGIN:VCALENDAR\r\n"
                + "VERSION:2.0\r\n"
                + "BEGIN:VEVENT\r\n"
                + "UID:intern-uid\r\n"
                + "DTSTART;TZID=Asia/Tokyo:20260121T100000\r\n"
                + "DTEND;TZID=Asia/Tokyo:20260121T170000\r\n"
                + "RELATED-TO;RELTYPE=X-CALENDARSERVER-RECURRENCE-SET:3DDD2D76-1F68-4D48-81A\r\n"
                + " 4-2898A4B435B3\r\n"
                + "RRULE:FREQ=WEEKLY;UNTIL=20270331T145959Z;BYDAY=TU,WE,FR\r\n"
                + "SUMMARY:インターン\r\n"
                + "END:VEVENT\r\n"
                + "END:VCALENDAR\r\n";

        List<CalendarEventDto> events =
                parse(ics, "インターン", null, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 8, 1));

        assertFalse(events.isEmpty(), "RELATED-TOがあっても繰り返し予定がパースされること");
    }

    @Test
    void movedRecurrenceInstanceReplacesOriginalWithoutGhostDuplicate() {
        // マスターのRRULEでは金曜(20260821)が本来の回だが、RECURRENCE-IDで
        // 20260817(月)に移動させる上書きVEVENTが存在するケース。
        // EXDATEには元の日付(0821)が含まれていない実データ(iCloud)を再現している。
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:intern-uid
                DTSTART;TZID=Asia/Tokyo:20260121T100000
                DTEND;TZID=Asia/Tokyo:20260121T170000
                RRULE:FREQ=WEEKLY;UNTIL=20270331T145959Z;BYDAY=TU,WE,FR
                SUMMARY:インターン
                END:VEVENT
                BEGIN:VEVENT
                UID:intern-uid
                RECURRENCE-ID;TZID=Asia/Tokyo:20260821T100000
                DTSTART;TZID=Asia/Tokyo:20260817T100000
                DTEND;TZID=Asia/Tokyo:20260817T170000
                SUMMARY:インターン
                END:VEVENT
                END:VCALENDAR
                """;

        List<CalendarEventDto> events =
                parse(ics, "インターン", "#00FF00", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 9, 1));

        assertTrue(events.stream().anyMatch(e -> e.getDate().equals("2026-08-17")),
                "移動先の8/17にインターンの予定が表示されること");
        assertFalse(events.stream().anyMatch(e -> e.getDate().equals("2026-08-21")),
                "移動元の8/21には幽霊予定が残らないこと");

        CalendarEventDto moved = events.stream()
                .filter(e -> e.getDate().equals("2026-08-17")).findFirst().orElseThrow();
        assertTrue(moved.isOverridden(), "移動された回は上書き扱いとして識別できること");
        assertEquals("20260821T010000Z", moved.getRecurrenceId(),
                "RECURRENCE-ID は TZID 表記でも UTC 正準形に揃うこと");
    }

    @Test
    void extractsDetailPropertiesAndReminders() {
        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                UID:detail-uid
                DTSTART;TZID=Asia/Tokyo:20260805T130000
                DTEND;TZID=Asia/Tokyo:20260805T140000
                SUMMARY:打ち合わせ\\, 第2会議室
                LOCATION:東京都港区\\;1-2-3
                URL:https://example.com/meeting
                DESCRIPTION:議題\\n1. 進捗\\n2. 課題
                X-APPLE-CALENDAR-COLOR:#FF2D55
                BEGIN:VALARM
                ACTION:DISPLAY
                TRIGGER;RELATED=START:-PT30M
                END:VALARM
                BEGIN:VALARM
                ACTION:DISPLAY
                TRIGGER;RELATED=START:-P1D
                END:VALARM
                END:VEVENT
                END:VCALENDAR
                """;

        List<CalendarEventDto> events =
                parse(ics, "仕事", "#0000FF", LocalDate.of(2026, 8, 5), LocalDate.of(2026, 8, 6));

        assertEquals(1, events.size());
        CalendarEventDto e = events.get(0);
        assertEquals("打ち合わせ, 第2会議室", e.getTitle(), "エスケープが解除されること");
        assertEquals("東京都港区;1-2-3", e.getLocation());
        assertEquals("https://example.com/meeting", e.getUrl());
        assertEquals("議題\n1. 進捗\n2. 課題", e.getNotes());
        assertEquals("#FF2D55", e.getTagColor());
        assertEquals(List.of(30, 1440), e.getReminders());
    }

    @Test
    void parsesTriggerDurations() {
        assertEquals(30, AppleCalendarService.parseTriggerMinutes("-PT30M"));
        assertEquals(1440, AppleCalendarService.parseTriggerMinutes("-P1D"));
        assertEquals(60, AppleCalendarService.parseTriggerMinutes("-PT1H"));
        assertEquals(-15, AppleCalendarService.parseTriggerMinutes("PT15M"),
                "開始後のトリガーは負値になること");
        assertNull(AppleCalendarService.parseTriggerMinutes("19760401T005545Z"),
                "絶対日時トリガーは分数に解釈しないこと");
    }

    @Test
    void canonicalisesRecurrenceIdAcrossRepresentations() {
        // 同じ瞬間を指す3つの表記が同一の正準形になること
        String fromTzid = AppleCalendarService.canonicalRecurrenceId("20260821T100000", "Asia/Tokyo");
        String fromUtc = AppleCalendarService.canonicalRecurrenceId("20260821T010000Z", null);
        assertEquals(fromTzid, fromUtc);
        assertEquals("20260821T010000Z", fromUtc);

        assertEquals("20260821", AppleCalendarService.canonicalRecurrenceId("20260821", null),
                "終日は日付のまま保つこと");
    }
}
