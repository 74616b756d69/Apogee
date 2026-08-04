package com.space.service;

import com.space.dto.AvailabilityRuleDto;
import com.space.dto.AvailabilitySlotDto;
import com.space.dto.CalendarEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AvailabilityService {

    private final AppleCalendarService calendarService;

    public List<AvailabilitySlotDto> getAvailableSlots(LocalDate from, LocalDate to,
                                                         int durationMinutes,
                                                         List<AvailabilityRuleDto> rules) {
        List<AvailabilitySlotDto> slots = new ArrayList<>();

        Map<String, List<CalendarEventDto>> events = calendarService.getEventsForWeek(from);
        Set<CalendarEventDto> busySet = new HashSet<>(events.values().stream()
                .flatMap(List::stream)
                .toList());

        LocalDate current = from;
        while (!current.isAfter(to)) {
            DayOfWeek dow = current.getDayOfWeek();
            int isoDay = dow.getValue();  // 1=Monday, 7=Sunday

            AvailabilityRuleDto rule = rules.stream()
                    .filter(r -> r.getDayOfWeek() == isoDay)
                    .findFirst()
                    .orElse(null);

            if (rule != null && !isFullyBlockedDay(current, busySet)) {
                List<AvailabilitySlotDto> daySlots = generateDaySlots(
                        current, rule.getStartTime(), rule.getEndTime(),
                        durationMinutes, busySet);
                slots.addAll(daySlots);
            }

            current = current.plusDays(1);
        }

        return slots;
    }

    private boolean isFullyBlockedDay(LocalDate date, Set<CalendarEventDto> busy) {
        for (CalendarEventDto event : busy) {
            if (event.getDate() != null && event.getDate().equals(date.toString())
                    && event.isAllDay()) {
                return true;
            }
        }
        return false;
    }

    private List<AvailabilitySlotDto> generateDaySlots(LocalDate date,
                                                        String startTimeStr,
                                                        String endTimeStr,
                                                        int durationMinutes,
                                                        Set<CalendarEventDto> busy) {
        List<AvailabilitySlotDto> daySlots = new ArrayList<>();
        LocalTime dayStart = LocalTime.parse(startTimeStr);
        LocalTime dayEnd = LocalTime.parse(endTimeStr);

        // Collect busy intervals for this day
        List<LocalTime[]> busyIntervals = new ArrayList<>();
        for (CalendarEventDto event : busy) {
            if (event.getDate() != null && event.getDate().equals(date.toString())
                    && !event.isAllDay() && event.getStartTime() != null) {
                LocalTime eventStart = LocalTime.parse(event.getStartTime());
                LocalTime eventEnd = event.getEndTime() != null
                        ? LocalTime.parse(event.getEndTime())
                        : eventStart.plusMinutes(30);
                busyIntervals.add(new LocalTime[]{eventStart, eventEnd});
            }
        }
        busyIntervals.sort(Comparator.comparing(i -> i[0]));

        // Generate available slots
        LocalTime current = dayStart;
        for (LocalTime[] interval : busyIntervals) {
            LocalTime slotEnd = current.plusMinutes(durationMinutes);
            if (slotEnd.compareTo(interval[0]) <= 0) {
                // Slot fits before this busy block
                daySlots.add(new AvailabilitySlotDto(
                        date.toString(),
                        current.format(DateTimeFormatter.ofPattern("HH:mm")),
                        slotEnd.format(DateTimeFormatter.ofPattern("HH:mm"))
                ));
                current = slotEnd;
            }
            if (current.compareTo(interval[0]) < 0) {
                current = interval[1];
            }
        }

        // Add final slot if space remains
        LocalTime slotEnd = current.plusMinutes(durationMinutes);
        if (slotEnd.compareTo(dayEnd) <= 0) {
            daySlots.add(new AvailabilitySlotDto(
                    date.toString(),
                    current.format(DateTimeFormatter.ofPattern("HH:mm")),
                    slotEnd.format(DateTimeFormatter.ofPattern("HH:mm"))
            ));
        }

        return daySlots;
    }
}
