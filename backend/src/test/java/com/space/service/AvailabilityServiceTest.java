package com.space.service;

import com.space.dto.AvailabilityRuleDto;
import com.space.dto.AvailabilitySlotDto;
import com.space.dto.CalendarEventDto;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 予約可能スロットの算出を、CalDAV に繋がずに検証する。 */
class AvailabilityServiceTest {

    /** 曜日ごとに固定の予定マップを返す差し替え版。getEventsForWeek だけを乗っ取る。 */
    private static class StubCalendar extends AppleCalendarService {
        private final Map<String, List<CalendarEventDto>> byDate = new HashMap<>();

        void addBusy(String date, String startTime, String endTime) {
            byDate.computeIfAbsent(date, k -> new ArrayList<>()).add(CalendarEventDto.builder()
                    .rawUid("busy-" + date + "-" + startTime)
                    .title("予定")
                    .allDay(false)
                    .date(date)
                    .startTime(startTime)
                    .endTime(endTime)
                    .build());
        }

        void addAllDay(String date) {
            byDate.computeIfAbsent(date, k -> new ArrayList<>()).add(CalendarEventDto.builder()
                    .rawUid("allday-" + date)
                    .title("終日")
                    .allDay(true)
                    .date(date)
                    .build());
        }

        @Override
        public Map<String, List<CalendarEventDto>> getEventsForWeek(LocalDate weekStart) {
            Map<String, List<CalendarEventDto>> out = new HashMap<>();
            for (int i = 0; i < 7; i++) {
                String key = weekStart.plusDays(i).toString();
                if (byDate.containsKey(key)) out.put(key, byDate.get(key));
            }
            return out;
        }
    }

    private List<AvailabilityRuleDto> everyDay(String start, String end) {
        List<AvailabilityRuleDto> rules = new ArrayList<>();
        for (int d = 1; d <= 7; d++) rules.add(new AvailabilityRuleDto(d, start, end));
        return rules;
    }

    @Test
    void fillsAWholeDayWithConsecutiveSlots() {
        AvailabilityService service = new AvailabilityService(new StubCalendar());
        LocalDate day = LocalDate.of(2026, 8, 31); // 月曜

        List<AvailabilitySlotDto> slots = service.getAvailableSlots(
                day, day, 60, everyDay("09:00", "12:00"));

        assertEquals(List.of("09:00", "10:00", "11:00"),
                slots.stream().map(AvailabilitySlotDto::getStartTime).toList());
    }

    @Test
    void skipsBusyIntervalsAndResumesAfterThem() {
        StubCalendar cal = new StubCalendar();
        cal.addBusy("2026-08-31", "10:00", "11:00");
        AvailabilityService service = new AvailabilityService(cal);
        LocalDate day = LocalDate.of(2026, 8, 31);

        List<AvailabilitySlotDto> slots = service.getAvailableSlots(
                day, day, 60, everyDay("09:00", "13:00"));

        // 09:00-10:00 が空き、10:00-11:00 は予定、11:00-12:00 と 12:00-13:00 が空き
        assertEquals(List.of("09:00", "11:00", "12:00"),
                slots.stream().map(AvailabilitySlotDto::getStartTime).toList());
    }

    @Test
    void honoursBusyBlockThatStartsBeforeWorkingHours() {
        StubCalendar cal = new StubCalendar();
        cal.addBusy("2026-08-31", "08:00", "10:00");
        AvailabilityService service = new AvailabilityService(cal);
        LocalDate day = LocalDate.of(2026, 8, 31);

        List<AvailabilitySlotDto> slots = service.getAvailableSlots(
                day, day, 60, everyDay("09:00", "12:00"));

        assertEquals(List.of("10:00", "11:00"),
                slots.stream().map(AvailabilitySlotDto::getStartTime).toList());
    }

    @Test
    void considersEventsBeyondTheFirstWeekOfTheRange() {
        StubCalendar cal = new StubCalendar();
        // 範囲開始から 20 日後の予定。1 週間しか見ないと取りこぼす。
        cal.addBusy("2026-09-20", "09:00", "18:00");
        AvailabilityService service = new AvailabilityService(cal);

        List<AvailabilitySlotDto> slots = service.getAvailableSlots(
                LocalDate.of(2026, 8, 31), LocalDate.of(2026, 9, 30),
                60, everyDay("09:00", "18:00"));

        assertTrue(slots.stream().noneMatch(s -> s.getDate().equals("2026-09-20")),
                "終日埋まっている 2026-09-20 にスロットを出してはいけない");
        assertTrue(slots.stream().anyMatch(s -> s.getDate().equals("2026-09-21")),
                "翌日には通常どおりスロットが出ること");
    }

    @Test
    void allDayEventBlocksTheWholeDay() {
        StubCalendar cal = new StubCalendar();
        cal.addAllDay("2026-08-31");
        AvailabilityService service = new AvailabilityService(cal);
        LocalDate day = LocalDate.of(2026, 8, 31);

        List<AvailabilitySlotDto> slots = service.getAvailableSlots(
                day, day, 60, everyDay("09:00", "18:00"));

        assertTrue(slots.isEmpty());
    }
}
