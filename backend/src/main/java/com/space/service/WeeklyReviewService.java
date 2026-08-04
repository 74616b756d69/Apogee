package com.space.service;

import com.space.dto.WeeklyReviewDto;
import com.space.dto.WeeklyReviewDto.CalendarSummaryDto;
import com.space.dto.WeeklyReviewDto.WeekdaySummaryDto;
import com.space.dto.CalendarEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class WeeklyReviewService {

    private final AppleCalendarService calendarService;

    public WeeklyReviewDto getWeeklyReview(String isoWeek) throws Exception {
        // Parse ISO week (e.g., "2026-W31")
        String[] parts = isoWeek.split("-W");
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid ISO week format: " + isoWeek);
        }

        int year = Integer.parseInt(parts[0]);
        int week = Integer.parseInt(parts[1]);

        LocalDate jan4 = LocalDate.of(year, 1, 4);
        LocalDate weekStart = jan4.minusDays(jan4.getDayOfWeek().getValue() - 1)
                .plusWeeks(week - 1);
        LocalDate weekEnd = weekStart.plusDays(7);

        Map<String, List<CalendarEventDto>> allEvents = calendarService.getEventsForWeek(weekStart);

        return aggregateWeeklyData(weekStart, weekEnd, allEvents);
    }

    private WeeklyReviewDto aggregateWeeklyData(LocalDate weekStart, LocalDate weekEnd,
                                                 Map<String, List<CalendarEventDto>> allEvents) {
        Map<String, CalendarSummaryDto> byCalendar = new HashMap<>();
        Map<String, WeekdaySummaryDto> byWeekday = new HashMap<>();
        long totalMinutes = 0;

        for (LocalDate date = weekStart; date.isBefore(weekEnd); date = date.plusDays(1)) {
            String dateStr = date.toString();
            DayOfWeek dow = date.getDayOfWeek();
            String weekday = dow.toString().substring(0, 3);  // "MON", "TUE", etc.

            List<CalendarEventDto> dayEvents = allEvents.getOrDefault(dateStr, new ArrayList<>());

            long dayMinutes = 0;
            int dayCount = 0;

            for (CalendarEventDto event : dayEvents) {
                String calName = event.getCalendarName() != null ? event.getCalendarName() : "Unnamed";

                // Count event
                dayCount++;

                // Accumulate minutes (skip all-day events for time totals)
                if (!event.isAllDay() && event.getStartTime() != null) {
                    long minutes = calculateEventDuration(event);
                    dayMinutes += minutes;
                    totalMinutes += minutes;

                    byCalendar.computeIfAbsent(calName, k -> new CalendarSummaryDto(
                            calName, event.getCalendarColor(), 0, 0))
                            .setMinutes(byCalendar.get(calName).getMinutes() + minutes);
                }

                byCalendar.computeIfAbsent(calName, k -> new CalendarSummaryDto(
                        calName, event.getCalendarColor(), 0, 0))
                        .setCount(byCalendar.get(calName).getCount() + 1);
            }

            byWeekday.put(dateStr, new WeekdaySummaryDto(dateStr, weekday, dayMinutes, dayCount));
        }

        List<CalendarSummaryDto> calendarList = new ArrayList<>(byCalendar.values());
        calendarList.sort((a, b) -> Long.compare(b.getMinutes(), a.getMinutes()));

        List<WeekdaySummaryDto> weekdayList = new ArrayList<>(byWeekday.values());
        weekdayList.sort(Comparator.comparing(WeekdaySummaryDto::getDate));

        WeeklyReviewDto result = new WeeklyReviewDto();
        result.setWeekStart(weekStart.toString());
        result.setWeekEnd(weekEnd.minusDays(1).toString());  // Last day of the week
        result.setTotalMinutes(totalMinutes);
        result.setByCalendar(calendarList);
        result.setByWeekday(weekdayList);

        return result;
    }

    private long calculateEventDuration(CalendarEventDto event) {
        if (event.getStartTime() == null) return 0;
        if (event.getEndTime() == null) return 30;  // Default 30 minutes

        try {
            LocalTime start = LocalTime.parse(event.getStartTime());
            LocalTime end = LocalTime.parse(event.getEndTime());
            return java.time.temporal.ChronoUnit.MINUTES.between(start, end);
        } catch (Exception e) {
            return 30;
        }
    }
}
