package com.space.controller;

import com.space.dto.CalendarEventDto;
import com.space.service.AppleCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

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
        return calendarService.getTodayEvents();
    }

    @GetMapping("/date")
    public List<CalendarEventDto> getByDate(@RequestParam String date) {
        try {
            return calendarService.getEventsForDate(LocalDate.parse(date));
        } catch (Exception e) {
            return List.of();
        }
    }
}
