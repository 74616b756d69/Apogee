package com.space.service.ics;

import com.space.dto.CalendarEventWriteDto;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** VEVENT の生成と、既存 VEVENT へのフィールド適用。 */
public final class IcsWriter {

    public static final DateTimeFormatter DATE_FMT     = DateTimeFormatter.ofPattern("yyyyMMdd");
    public static final DateTimeFormatter LOCAL_DT_FMT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
    public static final DateTimeFormatter UTC_DT_FMT   = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");

    private IcsWriter() {}

    /**
     * このアプリが管理するプロパティだけを差し替える。ここに現れないプロパティ
     * （ATTENDEE / ORGANIZER / X- 拡張など）は VEventBlock 側でそのまま温存される。
     */
    public static void applyFields(VEventBlock ev, CalendarEventWriteDto dto, ZoneId zone) {
        ev.setProp("SUMMARY", "SUMMARY:" + escapeText(nullToEmpty(dto.getTitle())));

        applyTiming(ev, dto, zone);

        ev.setProp("LOCATION", isBlank(dto.getLocation())
                ? null : "LOCATION:" + escapeText(dto.getLocation()));
        ev.setProp("URL", isBlank(dto.getUrl())
                ? null : "URL:" + escapeText(dto.getUrl()));
        ev.setProp("DESCRIPTION", isBlank(dto.getNotes())
                ? null : "DESCRIPTION:" + escapeText(dto.getNotes()));
        ev.setProp("COLOR", null);
        ev.setProp("X-APPLE-CALENDAR-COLOR", isBlank(dto.getTagColor())
                ? null : "X-APPLE-CALENDAR-COLOR:" + dto.getTagColor());

        ev.setProp("RRULE", isBlank(dto.getRrule()) ? null : "RRULE:" + dto.getRrule());

        ev.removeAlarms();
        if (dto.getReminders() != null) {
            for (Integer minutes : dto.getReminders()) {
                if (minutes == null) continue;
                ev.addBlockBeforeEnd(alarmBlock(minutes, nullToEmpty(dto.getTitle())));
            }
        }

        touch(ev);
    }

    /** DTSTART / DTEND を書き換える。DURATION 併用の既存イベントは DTEND に一本化する。 */
    public static void applyTiming(VEventBlock ev, CalendarEventWriteDto dto, ZoneId zone) {
        ev.removeProp("DURATION");
        if (dto.isAllDay()) {
            LocalDate start = LocalDate.parse(dto.getStart().substring(0, 10));
            LocalDate endExclusive = isBlank(dto.getEnd())
                    ? start.plusDays(1)
                    : LocalDate.parse(dto.getEnd().substring(0, 10));
            if (!endExclusive.isAfter(start)) endExclusive = start.plusDays(1);
            ev.setProp("DTSTART", "DTSTART;VALUE=DATE:" + start.format(DATE_FMT));
            ev.setProp("DTEND", "DTEND;VALUE=DATE:" + endExclusive.format(DATE_FMT));
        } else {
            ZonedDateTime start = parseInstant(dto.getStart(), zone);
            ZonedDateTime end = isBlank(dto.getEnd())
                    ? start.plusHours(1)
                    : parseInstant(dto.getEnd(), zone);
            if (!end.isAfter(start)) end = start.plusMinutes(15);
            String tzid = zone.getId();
            ev.setProp("DTSTART", "DTSTART;TZID=" + tzid + ":" + start.format(LOCAL_DT_FMT));
            ev.setProp("DTEND", "DTEND;TZID=" + tzid + ":" + end.format(LOCAL_DT_FMT));
        }
    }

    /** DTSTAMP / LAST-MODIFIED を現在時刻に、SEQUENCE を 1 進める。 */
    public static void touch(VEventBlock ev) {
        String now = ZonedDateTime.now(ZoneId.of("UTC")).format(UTC_DT_FMT);
        ev.setProp("DTSTAMP", "DTSTAMP:" + now);
        ev.setProp("LAST-MODIFIED", "LAST-MODIFIED:" + now);

        int seq = 0;
        String existing = ev.propValue("SEQUENCE");
        if (existing != null) {
            try { seq = Integer.parseInt(existing.trim()); } catch (NumberFormatException ignored) {}
        }
        ev.setProp("SEQUENCE", "SEQUENCE:" + (seq + 1));
    }

    public static VEventBlock newEvent(String uid, CalendarEventWriteDto dto, ZoneId zone) {
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VEVENT");
        lines.add("UID:" + uid);
        lines.add("CREATED:" + ZonedDateTime.now(ZoneId.of("UTC")).format(UTC_DT_FMT));
        lines.add("END:VEVENT");
        VEventBlock ev = new VEventBlock(lines);
        applyFields(ev, dto, zone);
        return ev;
    }

    public static String wrapCalendar(List<VEventBlock> events) {
        StringBuilder sb = new StringBuilder();
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VCALENDAR");
        lines.add("VERSION:2.0");
        lines.add("PRODID:-//Apogee//Calendar//JA");
        lines.add("CALSCALE:GREGORIAN");
        for (VEventBlock e : events) lines.addAll(e.lines());
        lines.add("END:VCALENDAR");
        for (String line : lines) sb.append(IcsFile.fold(line)).append("\r\n");
        return sb.toString();
    }

    // ── 値の整形 ──────────────────────────────────────

    /**
     * RFC 5545 の TEXT 値エスケープ。既存実装では未処理で、タイトルに "," や ";" を
     * 含めると ICS の構文が壊れて他クライアントから読めなくなっていた。
     */
    public static String escapeText(String value) {
        if (value == null) return "";
        return value
                .replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }

    public static String unescapeText(String value) {
        if (value == null) return null;
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' && i + 1 < value.length()) {
                char next = value.charAt(++i);
                switch (next) {
                    case 'n', 'N' -> out.append('\n');
                    case '\\', ';', ',' -> out.append(next);
                    default -> out.append(next);
                }
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** "-PT30M" 形式の TRIGGER 値を作る。minutes は開始の何分前か（負値は開始後）。 */
    public static String triggerValue(int minutesBefore) {
        Duration d = Duration.ofMinutes(Math.abs((long) minutesBefore));
        String iso = d.isZero() ? "PT0S" : d.toString();
        return (minutesBefore >= 0 ? "-" : "") + iso;
    }

    private static List<String> alarmBlock(int minutesBefore, String title) {
        List<String> block = new ArrayList<>();
        block.add("BEGIN:VALARM");
        block.add("ACTION:DISPLAY");
        block.add("DESCRIPTION:" + escapeText(title));
        block.add("TRIGGER;RELATED=START:" + triggerValue(minutesBefore));
        block.add("END:VALARM");
        return block;
    }

    /**
     * ISO-8601 を受け取り、オフセットが無ければ指定ゾーンとみなす。
     * フロントエンドが Date#toISOString()（UTC）で送っても、ローカル表記で送っても通す。
     */
    public static ZonedDateTime parseInstant(String value, ZoneId zone) {
        String v = value.trim();
        try {
            return OffsetDateTime.parse(v).atZoneSameInstant(zone);
        } catch (Exception ignored) {
            // オフセット無し表記へフォールバック
        }
        try {
            return LocalDateTime.parse(v).atZone(zone);
        } catch (Exception ignored) {
            // 秒省略・日付のみへフォールバック
        }
        if (v.length() == 16) {
            return LocalDateTime.parse(v + ":00").atZone(zone);
        }
        return LocalDate.parse(v.substring(0, 10)).atStartOfDay(zone);
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
    private static String nullToEmpty(String s) { return s == null ? "" : s; }
}
