package com.space.service;

import com.space.dto.TaskDto;
import com.space.service.AppleCalendarService.CollectionInfo;
import com.space.service.ics.IcsFile;
import com.space.service.ics.TodoWriter;
import com.space.service.ics.VEventBlock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** VTODO ↔ TaskDto の変換を、CalDAV に繋がずに検証する。 */
class TaskServiceTest {

    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");

    private TaskService service;
    private CollectionInfo list;

    @BeforeEach
    void setUp() {
        service = new TaskService(new AppleCalendarService());
        list = new CollectionInfo("https://example/lists/1/", "リマインダー", "#ff0000", Set.of("VTODO"));
    }

    private TaskDto parseOne(String vtodoBody) {
        String ics = """
            BEGIN:VCALENDAR
            VERSION:2.0
            PRODID:-//Test//JA
            BEGIN:VTODO
            %s
            END:VTODO
            END:VCALENDAR
            """.formatted(vtodoBody).replace("\n", "\r\n");
        List<TaskDto> tasks = service.parseTodos(ics, list);
        assertEquals(1, tasks.size(), "VTODO が 1 件取り出せること");
        return tasks.get(0);
    }

    @Test
    void parsesTaskWithDateOnlyDue() {
        TaskDto task = parseOne("""
            UID:TASK-1
            SUMMARY:牛乳を買う
            DUE;VALUE=DATE:20260810
            PRIORITY:1""");

        assertEquals("TASK-1", task.getRawUid());
        assertEquals("TASK-1_2026-08-10", task.getUid());
        assertEquals("牛乳を買う", task.getTitle());
        assertEquals("2026-08-10", task.getDueDate());
        assertEquals("HIGH", task.getPriority());
        assertFalse(task.isCompleted());
        assertEquals("リマインダー", task.getCalendarName());
        assertEquals("#ff0000", task.getCalendarColor());
        assertNull(task.getScheduledDate(), "日付のみの期限は時間ブロックではない");
        assertNull(task.getScheduledStartTime());
    }

    @Test
    void parsesTimeBlockedTask() {
        TaskDto task = parseOne("""
            UID:TASK-2
            SUMMARY:レポート作成
            DTSTART;TZID=Asia/Tokyo:20260805T140000
            DUE;TZID=Asia/Tokyo:20260805T153000""");

        assertEquals("2026-08-05", task.getScheduledDate());
        assertEquals("14:00", task.getScheduledStartTime());
        assertEquals("15:30", task.getScheduledEndTime());
        assertEquals("2026-08-05", task.getDueDate());
        assertEquals("TASK-2_2026-08-05", task.getUid());
    }

    @Test
    void timeBlockWithoutEndFallsBackToOneHour() {
        TaskDto task = parseOne("""
            UID:TASK-3
            SUMMARY:散歩
            DTSTART;TZID=Asia/Tokyo:20260805T090000""");

        assertEquals("09:00", task.getScheduledStartTime());
        assertEquals("10:00", task.getScheduledEndTime());
    }

    @Test
    void readsUtcTimestampsInLocalZone() {
        // 2026-08-05T01:00Z は JST では同日 10:00
        TaskDto task = parseOne("""
            UID:TASK-4
            SUMMARY:朝会
            DTSTART:20260805T010000Z
            DUE:20260805T020000Z""");

        assertEquals("2026-08-05", task.getScheduledDate());
        assertEquals("10:00", task.getScheduledStartTime());
        assertEquals("11:00", task.getScheduledEndTime());
    }

    @Test
    void detectsCompletionFromAnyOfTheThreeMarkers() {
        assertTrue(parseOne("UID:A\nSUMMARY:x\nSTATUS:COMPLETED".replace("\n", "\r\n")).isCompleted());
        assertTrue(parseOne("UID:B\nSUMMARY:x\nCOMPLETED:20260801T120000Z".replace("\n", "\r\n")).isCompleted());
        assertTrue(parseOne("UID:C\nSUMMARY:x\nPERCENT-COMPLETE:100".replace("\n", "\r\n")).isCompleted());
        assertFalse(parseOne("UID:D\nSUMMARY:x\nSTATUS:NEEDS-ACTION".replace("\n", "\r\n")).isCompleted());
        assertFalse(parseOne("UID:E\nSUMMARY:x\nPERCENT-COMPLETE:40".replace("\n", "\r\n")).isCompleted());
    }

    @Test
    void mapsPriorityRanges() {
        assertEquals("HIGH", parseOne("UID:A\nSUMMARY:x\nPRIORITY:1".replace("\n", "\r\n")).getPriority());
        assertEquals("HIGH", parseOne("UID:B\nSUMMARY:x\nPRIORITY:4".replace("\n", "\r\n")).getPriority());
        assertEquals("MEDIUM", parseOne("UID:C\nSUMMARY:x\nPRIORITY:5".replace("\n", "\r\n")).getPriority());
        assertEquals("LOW", parseOne("UID:D\nSUMMARY:x\nPRIORITY:9".replace("\n", "\r\n")).getPriority());
        assertEquals("NONE", parseOne("UID:E\nSUMMARY:x\nPRIORITY:0".replace("\n", "\r\n")).getPriority());
        assertEquals("NONE", parseOne("UID:F\nSUMMARY:x".replace("\n", "\r\n")).getPriority());
    }

    @Test
    void unescapesTextValues() {
        TaskDto task = parseOne("UID:A\nSUMMARY:牛乳\\, パン\\; 卵".replace("\n", "\r\n"));
        assertEquals("牛乳, パン; 卵", task.getTitle());
    }

    @Test
    void skipsTodoWithoutUid() {
        String ics = """
            BEGIN:VCALENDAR
            BEGIN:VTODO
            SUMMARY:UIDなし
            END:VTODO
            END:VCALENDAR
            """.replace("\n", "\r\n");
        assertTrue(service.parseTodos(ics, list).isEmpty());
    }

    @Test
    void ignoresVeventsInTheSameResource() {
        String ics = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            UID:EVENT-1
            SUMMARY:これはイベント
            DTSTART;VALUE=DATE:20260805
            END:VEVENT
            BEGIN:VTODO
            UID:TASK-1
            SUMMARY:これはタスク
            END:VTODO
            END:VCALENDAR
            """.replace("\n", "\r\n");

        List<TaskDto> tasks = service.parseTodos(ics, list);
        assertEquals(1, tasks.size());
        assertEquals("これはタスク", tasks.get(0).getTitle());
    }

    // ── 書き込み ─────────────────────────────────────

    private VEventBlock writeAndReparse(TodoWriter.Fields fields) {
        String ics = com.space.service.ics.IcsWriter.wrapCalendar(
                List.of(TodoWriter.newTodo("NEW-1", fields, JST)));
        IcsFile file = IcsFile.parse(ics, IcsFile.VTODO);
        assertEquals(1, file.events().size());
        return file.events().get(0);
    }

    @Test
    void writesDateOnlyDueWhenNotTimeBlocked() {
        VEventBlock todo = writeAndReparse(new TodoWriter.Fields(
                "買い物", "2026-08-10", "MEDIUM", false, null, null, null));

        assertEquals("DUE;VALUE=DATE:20260810", todo.propLine("DUE"));
        assertNull(todo.propLine("DTSTART"), "時間ブロック無しでは DTSTART を置かない");
        assertEquals("5", todo.propValue("PRIORITY"));
        assertEquals("NEEDS-ACTION", todo.propValue("STATUS"));
    }

    @Test
    void writesTimeBlockAsDtstartAndDue() {
        VEventBlock todo = writeAndReparse(new TodoWriter.Fields(
                "集中作業", null, "NONE", false, "2026-08-05", "14:00", "15:30"));

        assertEquals("DTSTART;TZID=Asia/Tokyo:20260805T140000", todo.propLine("DTSTART"));
        assertEquals("DUE;TZID=Asia/Tokyo:20260805T153000", todo.propLine("DUE"));
        assertNull(todo.propLine("PRIORITY"), "NONE は PRIORITY 行を残さない");
        assertNull(todo.propLine("DURATION"), "VTODO で DUE と DURATION は併用しない");
    }

    @Test
    void writesCompletionMarkersTogether() {
        VEventBlock todo = writeAndReparse(new TodoWriter.Fields(
                "完了済み", null, null, true, null, null, null));

        assertEquals("COMPLETED", todo.propValue("STATUS"));
        assertEquals("100", todo.propValue("PERCENT-COMPLETE"));
        assertNotNull(todo.propValue("COMPLETED"));
    }

    @Test
    void uncompletingClearsAllCompletionMarkers() {
        VEventBlock todo = writeAndReparse(new TodoWriter.Fields(
                "やり直し", null, null, true, null, null, null));
        TodoWriter.applyCompletion(todo, false);

        assertEquals("NEEDS-ACTION", todo.propValue("STATUS"));
        assertNull(todo.propValue("COMPLETED"));
        assertNull(todo.propValue("PERCENT-COMPLETE"));
        assertFalse(TodoWriter.isCompleted(todo));
    }

    @Test
    void endBeforeStartIsWidenedToOneHour() {
        VEventBlock todo = writeAndReparse(new TodoWriter.Fields(
                "逆転", null, null, false, "2026-08-05", "14:00", "13:00"));

        assertEquals("DUE;TZID=Asia/Tokyo:20260805T150000", todo.propLine("DUE"));
    }

    @Test
    void preservesUnknownPropertiesOnUpdate() {
        String ics = """
            BEGIN:VCALENDAR
            BEGIN:VTODO
            UID:TASK-1
            SUMMARY:元のタイトル
            RELATED-TO;RELTYPE=PARENT:PARENT-UID
            X-APPLE-SORT-ORDER:42
            END:VTODO
            END:VCALENDAR
            """.replace("\n", "\r\n");

        IcsFile file = IcsFile.parse(ics, IcsFile.VTODO);
        VEventBlock todo = file.events().get(0);
        TodoWriter.applyFields(todo, new TodoWriter.Fields(
                "新しいタイトル", null, null, false, null, null, null), JST);

        String rendered = file.render();
        assertTrue(rendered.contains("SUMMARY:新しいタイトル"));
        assertFalse(rendered.contains("元のタイトル"));
        assertTrue(rendered.contains("RELATED-TO;RELTYPE=PARENT:PARENT-UID"),
                "サブタスクの親子関係を落とさないこと");
        assertTrue(rendered.contains("X-APPLE-SORT-ORDER:42"),
                "純正クライアントの並び順を落とさないこと");
    }

    @Test
    void roundTripsTimeBlockThroughIcs() {
        VEventBlock written = writeAndReparse(new TodoWriter.Fields(
                "往復", null, null, false, "2026-08-05", "14:00", "15:30"));

        TaskDto task = parseOne(String.join("\r\n",
                "UID:NEW-1",
                written.propLine("SUMMARY"),
                written.propLine("DTSTART"),
                written.propLine("DUE")));

        assertEquals("2026-08-05", task.getScheduledDate());
        assertEquals("14:00", task.getScheduledStartTime());
        assertEquals("15:30", task.getScheduledEndTime());
    }
}
