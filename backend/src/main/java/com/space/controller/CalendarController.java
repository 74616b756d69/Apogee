package com.space.controller;

import com.space.dto.CalendarEventDto;
import com.space.dto.CalendarEventWriteDto;
import com.space.service.AppleCalendarService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Apple Calendar (CalDAV) 連携 API
 *
 * <p>取得系は2系統ある:
 * <ul>
 *   <li>{@code GET /events?start=&end=} — 複数日イベントを1件のまま返す。カレンダー UI 用。</li>
 *   <li>{@code /today}, {@code /date}, {@code /month}, {@code /week} — 日付キーごとに
 *       展開したマップ。今日のビューや週次レビューなど、日単位で集計する用途向け。</li>
 * </ul>
 *
 * 設定方法: application.properties に下記を追加
 *   apple.calendar.username=your@icloud.com
 *   apple.calendar.password=xxxx-xxxx-xxxx-xxxx  (アプリ専用パスワード)
 *
 * アプリ専用パスワードの発行: https://appleid.apple.com → セキュリティ → アプリ専用パスワード
 */
@Slf4j
@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
public class CalendarController {

    private final AppleCalendarService calendarService;

    @GetMapping("/events")
    public List<CalendarEventDto> getEvents(@RequestParam String start, @RequestParam String end) {
        LocalDate from = parseDate(start);
        LocalDate to = parseDate(end);
        if (!to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "end must be after start");
        }
        if (from.plusYears(2).isBefore(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "range too wide (max 2 years)");
        }
        try {
            return calendarService.getEventsInRange(from, to);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Apple Calendar fetch failed");
        }
    }

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
        try {
            return calendarService.getEventsForDate(parseDate(date));
        } catch (ResponseStatusException e) {
            throw e;
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
        return calendarService.getEventsForWeek(parseDate(start));
    }

    @GetMapping("/collections")
    public List<Map<String, String>> getCollections() {
        return calendarService.getCollections();
    }

    @PostMapping("/event")
    @ResponseStatus(HttpStatus.CREATED)
    public void createEvent(@RequestBody CalendarEventWriteDto dto) {
        requireStart(dto);
        try {
            calendarService.createEvent(dto);
        } catch (Exception e) {
            throw toResponseStatus(e, "作成に失敗しました");
        }
    }

    @PutMapping("/event/{uid}")
    public void updateEvent(@PathVariable String uid, @RequestBody CalendarEventWriteDto dto) {
        requireStart(dto);
        try {
            calendarService.updateEvent(uid, dto);
        } catch (Exception e) {
            throw toResponseStatus(e, "更新に失敗しました");
        }
    }

    @DeleteMapping("/event/{uid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEvent(@PathVariable String uid,
                            @RequestParam(required = false) String calendarName,
                            @RequestParam(required = false) String recurrenceId,
                            @RequestParam(required = false) String editScope) {
        try {
            calendarService.deleteEvent(uid, calendarName, recurrenceId, editScope);
        } catch (Exception e) {
            throw toResponseStatus(e, "削除に失敗しました");
        }
    }

    private static void requireStart(CalendarEventWriteDto dto) {
        if (dto.getStart() == null || dto.getStart().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "start is required");
        }
    }

    private static LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date: " + value);
        }
    }

    /**
     * ETag 不一致（他クライアントが先に更新した）は 409 で返し、フロントに再取得を促す。
     * それ以外は 500 にまとめる。
     */
    private static ResponseStatusException toResponseStatus(Exception e, String fallbackMessage) {
        if (e.getMessage() != null && e.getMessage().contains("CONFLICT")) {
            return new ResponseStatusException(HttpStatus.CONFLICT,
                    "他の端末で更新されています。再読み込みしてください");
        }
        log.warn("Calendar write failed: {}", e.getMessage(), e);
        return new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, fallbackMessage);
    }
}
