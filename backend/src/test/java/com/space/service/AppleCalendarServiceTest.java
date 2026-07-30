package com.space.service;

import com.space.dto.CalendarEventDto;
import net.fortuna.ical4j.model.DateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

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
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "仕事", "#FF0000", toIcalDate(date), toIcalDate(date.plusDays(1)));

        assertEquals(1, events.size());
        CalendarEventDto event = events.get(0);
        assertEquals("朝会", event.getTitle());
        assertEquals("10:00", event.getStartTime());
        assertFalse(event.isAllDay());
        assertEquals("仕事", event.getCalendarName());
        assertEquals("#FF0000", event.getCalendarColor());
        assertEquals("2025-07-30", event.getDate());
        assertTrue(event.getUid().contains("test-uid-1"));
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
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "個人", null, toIcalDate(date), toIcalDate(date.plusDays(1)));

        assertEquals(1, events.size());
        CalendarEventDto event = events.get(0);
        assertEquals("終日イベント", event.getTitle());
        assertTrue(event.isAllDay());
        assertNull(event.getStartTime());
        assertEquals("2025-07-30", event.getDate());
    }

    @Test
    void parseMultiDayAllDayEvent() {
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
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "個人", "#00FF00", toIcalDate(from), toIcalDate(to));

        assertEquals(4, events.size());
        assertEquals("2025-07-28", events.get(0).getDate());
        assertEquals("2025-07-29", events.get(1).getDate());
        assertEquals("2025-07-30", events.get(2).getDate());
        assertEquals("2025-07-31", events.get(3).getDate());
        for (CalendarEventDto e : events) {
            assertEquals("夏休み", e.getTitle());
            assertTrue(e.isAllDay());
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
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "仕事", null, toIcalDate(date), toIcalDate(date.plusDays(1)));

        assertTrue(events.isEmpty());
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
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "個人", null, toIcalDate(date), toIcalDate(date.plusDays(1)));

        assertEquals(1, events.size());
        assertEquals("（タイトルなし）", events.get(0).getTitle());
    }

    @Test
    void parseInvalidIcsReturnsEmpty() {
        List<CalendarEventDto> events = service.parseIcsForRange(
                "invalid data", "cal", null,
                toIcalDate(LocalDate.of(2025, 7, 30)),
                toIcalDate(LocalDate.of(2025, 7, 31)));

        assertTrue(events.isEmpty());
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

        LocalDate from = LocalDate.of(2025, 7, 1);
        LocalDate to = LocalDate.of(2025, 8, 1);
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "仕事", "#0000FF", toIcalDate(from), toIcalDate(to));

        assertTrue(events.size() >= 4);
        for (CalendarEventDto e : events) {
            assertEquals("週次ミーティング", e.getTitle());
            assertEquals("09:00", e.getStartTime());
            assertFalse(e.isAllDay());
        }
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

        LocalDate from = LocalDate.of(2026, 7, 1);
        LocalDate to = LocalDate.of(2026, 8, 1);
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "その他日程", null, toIcalDate(from), toIcalDate(to));

        assertFalse(events.isEmpty(), "公欠申請ずみイベントがパースされること");
        assertTrue(events.stream().anyMatch(e -> e.getDate().equals("2026-07-01")));
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

        LocalDate from = LocalDate.of(2026, 7, 1);
        LocalDate to = LocalDate.of(2026, 8, 1);
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "インターン", null, toIcalDate(from), toIcalDate(to));

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

        LocalDate from = LocalDate.of(2026, 8, 1);
        LocalDate to = LocalDate.of(2026, 9, 1);
        List<CalendarEventDto> events = service.parseIcsForRange(
                ics, "インターン", "#00FF00", toIcalDate(from), toIcalDate(to));

        assertTrue(events.stream().anyMatch(e -> e.getDate().equals("2026-08-17")),
                "移動先の8/17にインターンの予定が表示されること");
        assertFalse(events.stream().anyMatch(e -> e.getDate().equals("2026-08-21")),
                "移動元の8/21には幽霊予定が残らないこと");
    }
}
