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

    /** 一度に算出する予約可能期間の上限（日）。公開エンドポイントの負荷対策。 */
    private static final int MAX_RANGE_DAYS = 92;

    public List<AvailabilitySlotDto> getAvailableSlots(LocalDate from, LocalDate to,
                                                         int durationMinutes,
                                                         List<AvailabilityRuleDto> rules) {
        List<AvailabilitySlotDto> slots = new ArrayList<>();
        if (to.isBefore(from)) return slots;

        // 公開エンドポイントから任意の期間を渡せるため、暴走した範囲で CalDAV を
        // 大量に叩かないよう上限を設ける（予約 UI で 3 ヶ月以上先を一度に見ることはない）。
        LocalDate rangeEnd = to.isAfter(from.plusDays(MAX_RANGE_DAYS))
                ? from.plusDays(MAX_RANGE_DAYS) : to;

        // getEventsForWeek は from から 7 日分しか返さない。予約可能期間は数週間先まで
        // 指定されうるので、7 日ずつ窓をずらして期間全体の予定を集める。
        // （各週の CalDAV 取得は AppleCalendarService 側でキャッシュ・合流される）
        Set<CalendarEventDto> busySet = new HashSet<>();
        for (LocalDate weekStart = from; !weekStart.isAfter(rangeEnd); weekStart = weekStart.plusDays(7)) {
            calendarService.getEventsForWeek(weekStart).values()
                    .forEach(busySet::addAll);
        }

        LocalDate current = from;
        while (!current.isAfter(rangeEnd)) {
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
        if (durationMinutes <= 0) return daySlots;

        LocalTime dayStart = LocalTime.parse(startTimeStr);
        LocalTime dayEnd = LocalTime.parse(endTimeStr);
        if (!dayStart.isBefore(dayEnd)) return daySlots;

        // この日の予定時間帯を集める。終日・開始時刻なし・日跨ぎ/ゼロ長は対象外。
        List<LocalTime[]> busyIntervals = new ArrayList<>();
        for (CalendarEventDto event : busy) {
            if (event.getDate() == null || !event.getDate().equals(date.toString())) continue;
            if (event.isAllDay() || event.getStartTime() == null) continue;
            LocalTime eventStart = LocalTime.parse(event.getStartTime());
            LocalTime eventEnd = event.getEndTime() != null
                    ? LocalTime.parse(event.getEndTime())
                    : eventStart.plusMinutes(30);
            if (!eventEnd.isAfter(eventStart)) continue;
            busyIntervals.add(new LocalTime[]{eventStart, eventEnd});
        }
        busyIntervals.sort(Comparator.comparing(i -> i[0]));

        // 稼働時間帯を duration 刻みで走査し、予定と重なる区間は予定の終わりまで飛ばす。
        DateTimeFormatter hhmm = DateTimeFormatter.ofPattern("HH:mm");
        LocalTime cursor = dayStart;
        while (true) {
            LocalTime slotEnd = cursor.plusMinutes(durationMinutes);
            // plusMinutes が 24:00 を跨ぐと値が巻き戻るため、その場合も打ち切る。
            if (slotEnd.isAfter(dayEnd) || !slotEnd.isAfter(cursor)) break;

            LocalTime blockedUntil = null;
            for (LocalTime[] interval : busyIntervals) {
                boolean overlaps = interval[0].isBefore(slotEnd) && interval[1].isAfter(cursor);
                if (overlaps && (blockedUntil == null || interval[1].isAfter(blockedUntil))) {
                    blockedUntil = interval[1];
                }
            }

            if (blockedUntil != null) {
                cursor = blockedUntil;  // 予定終了まで進める（必ず cursor より後ろ）
                continue;
            }

            daySlots.add(new AvailabilitySlotDto(date.toString(),
                    cursor.format(hhmm), slotEnd.format(hhmm)));
            cursor = slotEnd;
        }

        return daySlots;
    }
}
