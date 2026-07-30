package com.space.controller;

import com.space.dto.CalendarEventCreateDto;
import com.space.dto.CalendarEventDto;
import com.space.dto.CalendarEventUpdateDto;
import com.space.service.AppleCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Apple Calendar (CalDAV) 連携 API
 *
 * GET /api/calendar/today — 今日のカレンダーイベント一覧
 *
 * 設定方法: application.properties に下記を追加
 *   apple.calendar.username=your@icloud.com
 *   apple.calendar.password=xxxx-xxxx-xxxx-xxxx  (アプリ専用パスワード)
 *
 * アプリ専用パスワードの発行: https://appleid.apple.com → セキュリティ → アプリ専用パスワード
 */
@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
public class CalendarController {

    private final AppleCalendarService calendarService;

    @GetMapping("/today")
    public List<CalendarEventDto> getToday() {
        try {
            return calendarService.getTodayEvents();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Apple Calendar fetch failed");
        }
    }

    @GetMapping("/date")
    public List<CalendarEventDto> getByDate(@RequestParam String date) {
        LocalDate parsed;
        try {
            parsed = LocalDate.parse(date);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date: " + date);
        }
        try {
            return calendarService.getEventsForDate(parsed);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Apple Calendar fetch failed");
        }
    }

    @GetMapping("/month")
    public Map<String, List<CalendarEventDto>> getByMonth(
            @RequestParam int year, @RequestParam int month) {
        return calendarService.getEventsForMonth(year, month);
    }

    @GetMapping("/week")
    public Map<String, List<CalendarEventDto>> getByWeek(@RequestParam String start) {
        LocalDate weekStart;
        try {
            weekStart = LocalDate.parse(start);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date: " + start);
        }
        return calendarService.getEventsForWeek(weekStart);
    }

    @GetMapping("/collections")
    public List<Map<String, String>> getCollections() {
        return calendarService.getCollections();
    }

    @PostMapping("/event")
    @ResponseStatus(HttpStatus.CREATED)
    public void createEvent(@RequestBody CalendarEventCreateDto dto) {
        try {
            calendarService.createEvent(dto);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    @PutMapping("/event/{uid}")
    public void updateEvent(@PathVariable String uid,
                            @RequestBody CalendarEventUpdateDto dto) {
        try {
            calendarService.updateEvent(uid, dto);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    @DeleteMapping("/event/{uid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEvent(@PathVariable String uid,
                            @RequestParam(required = false) String calendarName) {
        try {
            calendarService.deleteEvent(uid, calendarName);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }
}
