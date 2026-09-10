package com.space.service.ics;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * VTODO（Apple リマインダー）の生成と、既存 VTODO へのフィールド適用。
 *
 * <p>{@link IcsWriter} と同じ方針で、このアプリが管理するプロパティ行だけを差し替える。
 * 他クライアントが書いた X- 拡張やサブタスクの RELATED-TO などは温存される。
 *
 * <h2>時間ブロックの表現</h2>
 * <ul>
 *   <li>期限のみ（時間未指定）: {@code DUE;VALUE=DATE:YYYYMMDD}、DTSTART なし</li>
 *   <li>時間ブロック済み: {@code DTSTART;TZID=...} と {@code DUE;TZID=...} を共に日時で持つ。
 *       Apple リマインダーからは「その日時が期限のタスク」として自然に見える。</li>
 * </ul>
 * DTSTART が日時を持つかどうかが、時間ブロック済みかどうかの判定になる。
 */
public final class TodoWriter {

    /** RFC 5545 の PRIORITY 値。Apple リマインダーの「高 / 中 / 低」に対応する。 */
    public static final int PRIORITY_HIGH = 1;
    public static final int PRIORITY_MEDIUM = 5;
    public static final int PRIORITY_LOW = 9;

    private TodoWriter() {}

    /** VTODO に書き込むフィールド一式。null は「未設定」を意味する。 */
    public record Fields(
            String title,
            String dueDate,
            String priority,
            boolean completed,
            String scheduledDate,
            String scheduledStartTime,
            String scheduledEndTime) {}

    public static VEventBlock newTodo(String uid, Fields fields, ZoneId zone) {
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VTODO");
        lines.add("UID:" + uid);
        lines.add("CREATED:" + ZonedDateTime.now(ZoneId.of("UTC")).format(IcsWriter.UTC_DT_FMT));
        lines.add("END:VTODO");
        VEventBlock todo = new VEventBlock(lines);
        applyFields(todo, fields, zone);
        return todo;
    }

    public static void applyFields(VEventBlock todo, Fields fields, ZoneId zone) {
        todo.setProp("SUMMARY", "SUMMARY:" + IcsWriter.escapeText(nullToEmpty(fields.title())));
        applyTiming(todo, fields, zone);
        applyPriority(todo, fields.priority());
        applyCompletion(todo, fields.completed());
        IcsWriter.touch(todo);
    }

    /**
     * DTSTART / DUE を書き換える。
     *
     * <p>時間ブロックが指定された場合のみ DTSTART を日時で置き、DUE も同じ日の終了時刻にする。
     * RFC 5545 は VTODO で DUE と DURATION の併用を禁じているため、長さは DURATION ではなく
     * DUE との差で表現する。
     */
    public static void applyTiming(VEventBlock todo, Fields fields, ZoneId zone) {
        todo.removeProp("DURATION");

        String tzid = zone.getId();
        LocalDate blockDate = parseDateOrNull(fields.scheduledDate());
        LocalTime start = parseTimeOrNull(fields.scheduledStartTime());

        if (blockDate != null && start != null) {
            LocalTime end = parseTimeOrNull(fields.scheduledEndTime());
            if (end == null || !end.isAfter(start)) end = start.plusHours(1);
            todo.setProp("DTSTART", "DTSTART;TZID=" + tzid + ":"
                    + blockDate.atTime(start).format(IcsWriter.LOCAL_DT_FMT));
            todo.setProp("DUE", "DUE;TZID=" + tzid + ":"
                    + blockDate.atTime(end).format(IcsWriter.LOCAL_DT_FMT));
            return;
        }

        // 時間ブロックを外す。期限だけが残る。
        todo.setProp("DTSTART", null);
        LocalDate due = parseDateOrNull(fields.dueDate());
        todo.setProp("DUE", due == null ? null : "DUE;VALUE=DATE:" + due.format(IcsWriter.DATE_FMT));
    }

    public static void applyPriority(VEventBlock todo, String priority) {
        Integer value = priorityToIcs(priority);
        todo.setProp("PRIORITY", value == null ? null : "PRIORITY:" + value);
    }

    /**
     * 完了状態を書き込む。Apple リマインダーは STATUS だけでなく COMPLETED と
     * PERCENT-COMPLETE も見るため、3 つをまとめて整合させる。
     */
    public static void applyCompletion(VEventBlock todo, boolean completed) {
        if (completed) {
            todo.setProp("STATUS", "STATUS:COMPLETED");
            todo.setProp("PERCENT-COMPLETE", "PERCENT-COMPLETE:100");
            // 既に完了済みなら完了時刻は動かさない（他クライアントの記録を尊重する）
            if (todo.propValue("COMPLETED") == null) {
                todo.setProp("COMPLETED", "COMPLETED:"
                        + ZonedDateTime.now(ZoneId.of("UTC")).format(IcsWriter.UTC_DT_FMT));
            }
        } else {
            todo.setProp("STATUS", "STATUS:NEEDS-ACTION");
            todo.setProp("COMPLETED", null);
            todo.setProp("PERCENT-COMPLETE", null);
        }
    }

    // ── 読み取り ──────────────────────────────────────

    /** STATUS / COMPLETED / PERCENT-COMPLETE のいずれかが完了を示していれば true。 */
    public static boolean isCompleted(VEventBlock todo) {
        String status = todo.propValue("STATUS");
        if (status != null && status.trim().equalsIgnoreCase("COMPLETED")) return true;
        if (todo.propValue("COMPLETED") != null) return true;
        String percent = todo.propValue("PERCENT-COMPLETE");
        if (percent != null) {
            try {
                return Integer.parseInt(percent.trim()) >= 100;
            } catch (NumberFormatException ignored) {
                // 数値でない PERCENT-COMPLETE は未完了扱い
            }
        }
        return false;
    }

    /** RFC 5545 の PRIORITY 数値を HIGH / MEDIUM / LOW / NONE に丸める。 */
    public static String priorityFromIcs(String raw) {
        if (raw == null || raw.isBlank()) return "NONE";
        int value;
        try {
            value = Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return "NONE";
        }
        if (value <= 0) return "NONE";
        if (value <= 4) return "HIGH";
        if (value == 5) return "MEDIUM";
        return "LOW";
    }

    /** HIGH / MEDIUM / LOW を PRIORITY 数値に。NONE と未知の値は null（プロパティ削除）。 */
    public static Integer priorityToIcs(String priority) {
        if (priority == null) return null;
        return switch (priority.trim().toUpperCase()) {
            case "HIGH" -> PRIORITY_HIGH;
            case "MEDIUM" -> PRIORITY_MEDIUM;
            case "LOW" -> PRIORITY_LOW;
            default -> null;
        };
    }

    /**
     * DTSTART / DUE の値を、指定ゾーンでの日時として読む。
     *
     * <p>受け付ける形式は {@code 20260805}（日付のみ）、{@code 20260805T150000}（フローティング
     * またはTZID付き）、{@code 20260805T060000Z}（UTC）の 3 種。解釈できなければ null。
     */
    public static ZonedDateTime readDateTime(VEventBlock todo, String propName, ZoneId zone) {
        String value = todo.propValue(propName);
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        try {
            if (v.endsWith("Z")) {
                return LocalDate.parse(v.substring(0, 8), IcsWriter.DATE_FMT)
                        .atTime(LocalTime.parse(timePart(v.substring(9, 15))))
                        .atZone(ZoneId.of("UTC"))
                        .withZoneSameInstant(zone);
            }
            LocalDate date = LocalDate.parse(v.substring(0, 8), IcsWriter.DATE_FMT);
            if (v.length() < 15 || v.charAt(8) != 'T') {
                return date.atStartOfDay(zone);
            }
            ZoneId tz = zone;
            String tzid = todo.paramValue(propName, "TZID");
            if (tzid != null && !tzid.isBlank()) {
                try {
                    tz = ZoneId.of(tzid);
                } catch (Exception ignored) {
                    // 未知の TZID は既定ゾーンとして扱う
                }
            }
            return date.atTime(LocalTime.parse(timePart(v.substring(9, 15)))).atZone(tz)
                    .withZoneSameInstant(zone);
        } catch (Exception e) {
            return null;
        }
    }

    /** その値が「日付のみ」（時刻を持たない）かどうか。 */
    public static boolean isDateOnly(VEventBlock todo, String propName) {
        String value = todo.propValue(propName);
        if (value == null) return false;
        String v = value.trim();
        if (v.length() == 8) return true;
        return "DATE".equalsIgnoreCase(todo.paramValue(propName, "VALUE"));
    }

    // ── 内部 ─────────────────────────────────────────

    /** "150000" → "15:00:00" */
    private static String timePart(String hhmmss) {
        return hhmmss.substring(0, 2) + ":" + hhmmss.substring(2, 4) + ":" + hhmmss.substring(4, 6);
    }

    private static LocalDate parseDateOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalTime parseTimeOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            String v = value.trim();
            return LocalTime.parse(v.length() == 5 ? v : v.substring(0, 5));
        } catch (Exception e) {
            return null;
        }
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
