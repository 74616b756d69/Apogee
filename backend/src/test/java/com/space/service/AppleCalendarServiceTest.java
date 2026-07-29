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
}
