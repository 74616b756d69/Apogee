package com.space.service.ics;

import com.space.dto.CalendarEventWriteDto;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class IcsFileTest {

    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");

    /** Apple 純正クライアントが書いた、独自拡張と出席者を含む実データに近い ICS。 */
    private static final String APPLE_ICS = "BEGIN:VCALENDAR\r\n"
            + "CALSCALE:GREGORIAN\r\n"
            + "PRODID:-//Apple Inc.//macOS 26.5//EN\r\n"
            + "VERSION:2.0\r\n"
            + "BEGIN:VEVENT\r\n"
            + "CREATED:20260709T121116Z\r\n"
            + "UID:0C354403-95D2-415A-B882-FF6C3224675C\r\n"
            + "DTSTART;TZID=Asia/Tokyo:20260805T100000\r\n"
            + "DTEND;TZID=Asia/Tokyo:20260805T110000\r\n"
            + "SUMMARY:定例\r\n"
            + "LOCATION:第1会議室\r\n"
            + "ORGANIZER;CN=\"Takumi\":mailto:takumi@example.com\r\n"
            + "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=\"Sato\r\n"
            + " shi\";EMAIL=sato@example.com:mailto:sato@example.com\r\n"
            + "X-APPLE-CREATOR-IDENTITY:com.apple.calendar\r\n"
            + "X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M\r\n"
            + "SEQUENCE:3\r\n"
            + "BEGIN:VALARM\r\n"
            + "ACTION:DISPLAY\r\n"
            + "DESCRIPTION:定例\r\n"
            + "TRIGGER;RELATED=START:-PT15M\r\n"
            + "END:VALARM\r\n"
            + "END:VEVENT\r\n"
            + "END:VCALENDAR\r\n";

    @Test
    void roundTripsUnchangedContent() {
        IcsFile file = IcsFile.parse(APPLE_ICS);
        assertEquals(1, file.events().size());
        // 折り返し位置は再計算されるので、unfold した状態で比較する
        assertEquals(IcsFile.unfold(APPLE_ICS), IcsFile.unfold(file.render()));
    }

    @Test
    void updatePreservesPropertiesTheAppDoesNotManage() {
        IcsFile file = IcsFile.parse(APPLE_ICS);
        VEventBlock master = file.master();
        assertNotNull(master);

        CalendarEventWriteDto dto = new CalendarEventWriteDto();
        dto.setTitle("定例（時間変更）");
        dto.setAllDay(false);
        dto.setStart("2026-08-05T14:00:00+09:00");
        dto.setEnd("2026-08-05T15:00:00+09:00");
        dto.setLocation("第1会議室");

        IcsWriter.applyFields(master, dto, JST);
        String rendered = file.render();
        List<String> lines = IcsFile.unfold(rendered);

        // 触っていないプロパティは残る
        assertTrue(lines.stream().anyMatch(l -> l.startsWith("ORGANIZER;CN=\"Takumi\"")),
                "ORGANIZER が保持されること");
        assertTrue(lines.stream().anyMatch(l -> l.contains("ATTENDEE") && l.contains("sato@example.com")),
                "折り返された ATTENDEE が欠落しないこと");
        assertTrue(lines.stream().anyMatch(l -> l.startsWith("X-APPLE-TRAVEL-DURATION")),
                "Apple 独自拡張が保持されること");
        assertTrue(lines.contains("UID:0C354403-95D2-415A-B882-FF6C3224675C"), "UID が保持されること");
        assertTrue(lines.contains("CREATED:20260709T121116Z"), "CREATED が保持されること");

        // 管理対象は差し替わる
        assertTrue(lines.contains("SUMMARY:定例（時間変更）"));
        assertTrue(lines.contains("DTSTART;TZID=Asia/Tokyo:20260805T140000"));
        assertTrue(lines.contains("DTEND;TZID=Asia/Tokyo:20260805T150000"));
        assertEquals(1, lines.stream().filter(l -> l.startsWith("DTSTART")).count(),
                "DTSTART が重複しないこと");
        assertTrue(lines.contains("SEQUENCE:4"), "SEQUENCE が進むこと");

        // reminders 未指定なので VALARM は消える
        assertFalse(lines.contains("BEGIN:VALARM"));
    }

    @Test
    void keepsRemindersWhenProvided() {
        IcsFile file = IcsFile.parse(APPLE_ICS);
        CalendarEventWriteDto dto = new CalendarEventWriteDto();
        dto.setTitle("定例");
        dto.setStart("2026-08-05T10:00:00+09:00");
        dto.setEnd("2026-08-05T11:00:00+09:00");
        dto.setReminders(List.of(15, 1440));

        IcsWriter.applyFields(file.master(), dto, JST);
        List<String> lines = IcsFile.unfold(file.render());

        assertEquals(2, lines.stream().filter(l -> l.equals("BEGIN:VALARM")).count());
        assertTrue(lines.contains("TRIGGER;RELATED=START:-PT15M"));
        assertTrue(lines.contains("TRIGGER;RELATED=START:-PT24H"));
    }

    @Test
    void allDayEventUsesExclusiveEndDate() {
        CalendarEventWriteDto dto = new CalendarEventWriteDto();
        dto.setTitle("夏休み");
        dto.setAllDay(true);
        dto.setStart("2026-08-10");
        dto.setEnd("2026-08-15"); // 排他的 → 8/14 まで

        VEventBlock ev = IcsWriter.newEvent("new-uid", dto, JST);
        List<String> lines = ev.lines();
        assertTrue(lines.contains("DTSTART;VALUE=DATE:20260810"));
        assertTrue(lines.contains("DTEND;VALUE=DATE:20260815"));
    }

    @Test
    void escapesTextValuesSoCommasDoNotBreakTheIcs() {
        CalendarEventWriteDto dto = new CalendarEventWriteDto();
        dto.setTitle("打ち合わせ, 第2会議室");
        dto.setNotes("1行目\n2行目");
        dto.setLocation("港区;1-2-3");
        dto.setAllDay(true);
        dto.setStart("2026-08-10");

        VEventBlock ev = IcsWriter.newEvent("uid", dto, JST);
        assertTrue(ev.lines().contains("SUMMARY:打ち合わせ\\, 第2会議室"));
        assertTrue(ev.lines().contains("DESCRIPTION:1行目\\n2行目"));
        assertTrue(ev.lines().contains("LOCATION:港区\\;1-2-3"));

        assertEquals("打ち合わせ, 第2会議室", IcsWriter.unescapeText("打ち合わせ\\, 第2会議室"));
    }

    @Test
    void foldsLongLinesOnCodePointBoundaries() {
        String longTitle = "SUMMARY:" + "あ".repeat(60);
        String folded = IcsFile.fold(longTitle);

        assertTrue(folded.contains("\r\n "), "折り返しが入ること");
        for (String line : folded.split("\r\n")) {
            assertTrue(line.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 75,
                    "各行が75オクテット以内に収まること: " + line);
        }
        assertEquals(List.of(longTitle), IcsFile.unfold(folded), "unfold で元に戻ること");
    }

    @Test
    void readsParametersIgnoringColonsInsideQuotes() {
        VEventBlock ev = new VEventBlock(List.of(
                "BEGIN:VEVENT",
                "RECURRENCE-ID;TZID=Asia/Tokyo:20260821T100000",
                "ATTENDEE;CN=\"Sato: Shi\":mailto:sato@example.com",
                "END:VEVENT"));

        assertEquals("20260821T100000", ev.propValue("RECURRENCE-ID"));
        assertEquals("Asia/Tokyo", ev.paramValue("RECURRENCE-ID", "TZID"));
        assertEquals("mailto:sato@example.com", ev.propValue("ATTENDEE"),
                "引用符内のコロンは値の区切りとみなさないこと");
    }

    @Test
    void propertyLookupIgnoresNestedAlarmLines() {
        IcsFile file = IcsFile.parse(APPLE_ICS);
        VEventBlock master = file.master();

        assertEquals("定例", master.propValue("SUMMARY"),
                "VALARM 内の DESCRIPTION を VEVENT のものと取り違えないこと");
        assertNull(master.propValue("ACTION"), "VALARM 内のプロパティは直下として見えないこと");
        assertNull(master.propValue("TRIGGER"));
    }
}
