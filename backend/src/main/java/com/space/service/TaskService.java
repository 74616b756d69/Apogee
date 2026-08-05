package com.space.service;

import com.space.dto.TaskCreateDto;
import com.space.dto.TaskDto;
import com.space.dto.TaskUpdateDto;
import com.space.service.AppleCalendarService.CollectionInfo;
import com.space.service.ics.IcsFile;
import com.space.service.ics.IcsWriter;
import com.space.service.ics.TodoWriter;
import com.space.service.ics.VEventBlock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Apple リマインダー (CalDAV VTODO) 連携。
 *
 * <p>CalDAV の接続・探索・HTTP は {@link AppleCalendarService} が持っているものをそのまま
 * 借りる。扱うコンポーネントが VEVENT か VTODO かが違うだけで、認証・コレクション探索・
 * ETag による競合検出はカレンダーと完全に共通のため、二重に実装しない。
 *
 * <p>書き込みは行単位の差し替え（{@link IcsFile} / {@link TodoWriter}）で行うため、
 * 純正リマインダーが付けた位置情報アラームやサブタスクの RELATED-TO は保持される。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    /** リマインダーは件数が少なく更新も手動なので、カレンダーより短めの TTL で十分。 */
    private static final long TASKS_TTL_MS = 60 * 1000;

    private final AppleCalendarService calendarService;

    private record CachedTasks(List<TaskDto> tasks, long cachedAt) {}
    private volatile CachedTasks cache;

    /** rawUid → CalDAV リソース。更新・削除で href と ETag を引くための索引。 */
    private record TodoRef(String href, String etag, String listName) {}
    private final Map<String, TodoRef> resourceIndex = new ConcurrentHashMap<>();

    /** 絞り込み条件。未知の値は {@link #OPEN} として扱う。 */
    public enum Filter {
        ALL, OPEN, TODAY, OVERDUE, UPCOMING, COMPLETED;

        public static Filter from(String raw) {
            if (raw == null || raw.isBlank()) return OPEN;
            return switch (raw.trim().toLowerCase(Locale.ROOT)) {
                case "all" -> ALL;
                case "today" -> TODAY;
                case "overdue" -> OVERDUE;
                case "upcoming" -> UPCOMING;
                case "completed", "done" -> COMPLETED;
                default -> OPEN;
            };
        }
    }

    // ── 取得 ─────────────────────────────────────────

    public List<TaskDto> listTasks(String filter) {
        if (!calendarService.configured()) {
            log.info("Apple Calendar credentials not configured — skipping VTODO fetch.");
            return List.of();
        }
        return applyFilter(cachedTasks(), Filter.from(filter), LocalDate.now(JST));
    }

    /** リマインダーリストの一覧（名前と色）。タスク作成時のリスト選択に使う。 */
    public List<Map<String, String>> listTaskLists() {
        if (!calendarService.configured()) return List.of();
        try {
            return calendarService.todoCollections().stream()
                    .map(c -> Map.of(
                            "name", c.displayName(),
                            "color", c.color() != null ? c.color() : "#4a9eff"))
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to fetch reminder lists: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 期限や時間ブロックが指定日にかかるタスク。今日のビューで予定と並べる用途。
     * 期限切れの未完了タスクも「今日やるもの」として含める。
     */
    public List<TaskDto> getTasksForDate(LocalDate date) {
        if (!calendarService.configured()) return List.of();
        return applyFilter(cachedTasks(), Filter.TODAY, date);
    }

    private List<TaskDto> cachedTasks() {
        CachedTasks cached = cache;
        if (cached != null && (System.currentTimeMillis() - cached.cachedAt()) < TASKS_TTL_MS) {
            return cached.tasks();
        }
        List<TaskDto> tasks = fetchAllTasks();
        cache = new CachedTasks(tasks, System.currentTimeMillis());
        return tasks;
    }

    private List<TaskDto> fetchAllTasks() {
        try {
            List<CollectionInfo> lists = calendarService.todoCollections();
            if (lists.isEmpty()) {
                log.info("No VTODO collections found — is Reminders enabled for this iCloud account?");
                return List.of();
            }

            Map<String, TaskDto> merged = new ConcurrentHashMap<>();
            List<CompletableFuture<Void>> futures = lists.stream()
                    .map(info -> CompletableFuture.runAsync(() -> {
                        try {
                            for (TaskDto t : queryTodos(info)) {
                                merged.putIfAbsent(t.getUid(), t);
                            }
                        } catch (Exception ex) {
                            log.warn("VTODO query failed for list {} ({}): {}",
                                    info.displayName(), info.url(), ex.getMessage(), ex);
                        }
                    }))
                    .toList();
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            List<TaskDto> tasks = new ArrayList<>(merged.values());
            tasks.sort(TASK_ORDER);
            return List.copyOf(tasks);

        } catch (Exception e) {
            log.error("Reminder fetch failed: {}", e.getMessage(), e);
            return List.of();
        }
    }

    /**
     * 未完了を先に、次に期限の早い順、同じなら優先度の高い順。
     * 期限なしは期限ありより後ろに置く。
     */
    private static final Comparator<TaskDto> TASK_ORDER = Comparator
            .comparing(TaskDto::isCompleted)
            .thenComparing(TaskDto::getDueDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparingInt(t -> priorityRank(t.getPriority()))
            .thenComparing(t -> t.getTitle() == null ? "" : t.getTitle());

    private static int priorityRank(String priority) {
        if (priority == null) return 3;
        return switch (priority) {
            case "HIGH" -> 0;
            case "MEDIUM" -> 1;
            case "LOW" -> 2;
            default -> 3;
        };
    }

    private List<TaskDto> queryTodos(CollectionInfo info) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:getetag/>
                <c:calendar-data/>
              </d:prop>
              <c:filter>
                <c:comp-filter name="VCALENDAR">
                  <c:comp-filter name="VTODO"/>
                </c:comp-filter>
              </c:filter>
            </c:calendar-query>
            """;

        String xml = calendarService.sendWebDav("REPORT", info.url(), body, "1");
        if (xml == null) return List.of();

        List<TaskDto> tasks = new ArrayList<>();
        Document doc = calendarService.parseXml(xml);
        NodeList responses = doc.getElementsByTagNameNS("DAV:", "response");
        for (int i = 0; i < responses.getLength(); i++) {
            Element resp = (Element) responses.item(i);

            String href = AppleCalendarService.firstChildText(resp, "DAV:", "href");
            String etag = AppleCalendarService.stripQuotes(
                    AppleCalendarService.firstChildText(resp, "DAV:", "getetag"));
            String icsData = AppleCalendarService.firstChildText(
                    resp, "urn:ietf:params:xml:ns:caldav", "calendar-data");
            if (icsData == null || icsData.isBlank()) continue;

            for (TaskDto task : parseTodos(icsData, info)) {
                if (href != null && !href.isBlank()) {
                    resourceIndex.put(task.getRawUid(),
                            new TodoRef(AppleCalendarService.absolutize(href), etag, info.displayName()));
                }
                tasks.add(task);
            }
        }
        return tasks;
    }

    // ── パース ───────────────────────────────────────

    /** 1 リソース分の ICS から VTODO を取り出す。テストから直接呼べるよう分離してある。 */
    List<TaskDto> parseTodos(String icsData, CollectionInfo info) {
        List<TaskDto> result = new ArrayList<>();
        try {
            IcsFile file = IcsFile.parse(icsData, IcsFile.VTODO);
            for (VEventBlock todo : file.events()) {
                TaskDto dto = toDto(todo, info);
                if (dto != null) result.add(dto);
            }
        } catch (Exception e) {
            log.warn("Failed to parse VTODO from list {}: {}", info.displayName(), e.getMessage());
        }
        return result;
    }

    private TaskDto toDto(VEventBlock todo, CollectionInfo info) {
        String rawUid = todo.propValue("UID");
        if (rawUid == null || rawUid.isBlank()) return null;
        rawUid = rawUid.trim();

        String title = IcsWriter.unescapeText(todo.propValue("SUMMARY"));
        boolean completed = TodoWriter.isCompleted(todo);

        ZonedDateTime due = TodoWriter.readDateTime(todo, "DUE", JST);
        ZonedDateTime start = TodoWriter.readDateTime(todo, "DTSTART", JST);
        boolean timeBlocked = start != null && !TodoWriter.isDateOnly(todo, "DTSTART");

        String dueDate = due != null ? due.toLocalDate().toString() : null;
        String scheduledDate = timeBlocked ? start.toLocalDate().toString() : null;
        String scheduledStart = timeBlocked ? start.format(TIME_FMT) : null;
        String scheduledEnd = null;
        if (timeBlocked) {
            // 時間ブロックの終わりは DUE。無ければ 1 時間の既定値で表示する。
            ZonedDateTime end = due != null && !TodoWriter.isDateOnly(todo, "DUE")
                    ? due : start.plusHours(1);
            if (!end.isAfter(start)) end = start.plusHours(1);
            scheduledEnd = end.format(TIME_FMT);
        }

        // uid は「タスク × 表示日」の一意キー。同じタスクが複数日に現れても衝突しない。
        String dateKey = scheduledDate != null ? scheduledDate : (dueDate != null ? dueDate : "nodate");

        return new TaskDto(
                rawUid + "_" + dateKey,
                rawUid,
                title == null ? "" : title,
                dueDate,
                TodoWriter.priorityFromIcs(todo.propValue("PRIORITY")),
                completed,
                info.displayName(),
                info.color(),
                scheduledDate,
                scheduledStart,
                scheduledEnd);
    }

    // ── 絞り込み ─────────────────────────────────────

    private List<TaskDto> applyFilter(List<TaskDto> tasks, Filter filter, LocalDate today) {
        String todayKey = today.toString();
        return tasks.stream().filter(t -> switch (filter) {
            case ALL -> true;
            case COMPLETED -> t.isCompleted();
            case OPEN -> !t.isCompleted();
            case OVERDUE -> !t.isCompleted() && isBefore(t.getDueDate(), todayKey);
            case UPCOMING -> !t.isCompleted() && isAfter(t.getDueDate(), todayKey);
            // 今日やるもの: 期限が今日・期限切れ・今日に時間ブロック済みのいずれか
            case TODAY -> !t.isCompleted() && (
                    todayKey.equals(t.getDueDate())
                            || todayKey.equals(t.getScheduledDate())
                            || isBefore(t.getDueDate(), todayKey));
        }).toList();
    }

    /** ISO 日付文字列は辞書順と時系列順が一致するので、そのまま比較できる。 */
    private static boolean isBefore(String date, String reference) {
        return date != null && date.compareTo(reference) < 0;
    }

    private static boolean isAfter(String date, String reference) {
        return date != null && date.compareTo(reference) > 0;
    }

    // ── 書き込み ─────────────────────────────────────

    public TaskDto createTask(TaskCreateDto dto) throws Exception {
        calendarService.requireConfigured();
        if (dto == null || dto.getTitle() == null || dto.getTitle().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }

        CollectionInfo target = resolveList(dto.getCalendarName());
        String uid = UUID.randomUUID().toString().toUpperCase(Locale.ROOT);
        String url = AppleCalendarService.joinPath(target.url(), uid + ".ics");

        TodoWriter.Fields fields = new TodoWriter.Fields(
                dto.getTitle(), dto.getDueDate(), dto.getPriority(), false, null, null, null);
        String ics = IcsWriter.wrapCalendar(List.of(TodoWriter.newTodo(uid, fields, JST)));
        calendarService.putIcs(url, ics, null);

        resourceIndex.put(uid, new TodoRef(url, null, target.displayName()));
        invalidateCache();

        return new TaskDto(
                uid + "_" + (dto.getDueDate() != null ? dto.getDueDate() : "nodate"),
                uid,
                dto.getTitle(),
                dto.getDueDate(),
                normalizePriority(dto.getPriority()),
                false,
                target.displayName(),
                target.color(),
                null, null, null);
    }

    /**
     * 既存タスクを更新する。null のフィールドは現状維持で、送られてきたものだけ差し替える
     * （PATCH セマンティクス）。時間ブロックの解除は scheduledDate に空文字を送る。
     */
    public TaskDto updateTask(String rawUid, TaskUpdateDto dto) throws Exception {
        calendarService.requireConfigured();

        TodoRef ref = resolveResource(rawUid);
        AppleCalendarService.FetchedIcs fetched = calendarService.getIcs(ref.href());
        IcsFile file = IcsFile.parse(fetched.body(), IcsFile.VTODO);
        VEventBlock todo = findByUid(file, rawUid);
        if (todo == null) throw new IllegalStateException("VTODO not found in " + ref.href());

        CollectionInfo list = resolveList(ref.listName());
        TaskDto current = toDto(todo, list);

        TodoWriter.Fields fields = new TodoWriter.Fields(
                pick(dto.getTitle(), current.getTitle()),
                pickNullable(dto.getDueDate(), current.getDueDate()),
                pick(dto.getPriority(), current.getPriority()),
                dto.getCompleted() != null ? dto.getCompleted() : current.isCompleted(),
                pickNullable(dto.getScheduledDate(), current.getScheduledDate()),
                pickNullable(dto.getScheduledStartTime(), current.getScheduledStartTime()),
                pickNullable(dto.getScheduledEndTime(), current.getScheduledEndTime()));

        TodoWriter.applyFields(todo, fields, JST);
        calendarService.putIcs(ref.href(), file.render(), fetched.etag());

        invalidateCache();
        return toDto(todo, list);
    }

    public void deleteTask(String rawUid) throws Exception {
        calendarService.requireConfigured();
        TodoRef ref = resolveResource(rawUid);
        calendarService.deleteResource(ref.href(), null);
        resourceIndex.remove(rawUid);
        invalidateCache();
    }

    // ── 内部 ─────────────────────────────────────────

    /** 入力の優先度を、ICS に書ける 4 値のいずれかに丸める。 */
    private static String normalizePriority(String priority) {
        Integer ics = TodoWriter.priorityToIcs(priority);
        return ics == null ? "NONE" : TodoWriter.priorityFromIcs(ics.toString());
    }

    /** 送られてきた値を優先し、null なら現状維持。 */
    private static String pick(String incoming, String current) {
        return incoming != null ? incoming : current;
    }

    /**
     * null は現状維持、空文字は「消す」。期限や時間ブロックの解除を表現するために、
     * 「未指定」と「クリア」を区別する必要がある。
     */
    private static String pickNullable(String incoming, String current) {
        if (incoming == null) return current;
        return incoming.isBlank() ? null : incoming;
    }

    private static VEventBlock findByUid(IcsFile file, String rawUid) {
        for (VEventBlock todo : file.events()) {
            String uid = todo.propValue("UID");
            if (uid != null && uid.trim().equals(rawUid)) return todo;
        }
        // UID が一致しなくても単一 VTODO なら（サーバ側の正規化差異を考慮して）それを使う
        return file.events().size() == 1 ? file.events().get(0) : null;
    }

    private CollectionInfo resolveList(String listName) throws Exception {
        List<CollectionInfo> lists = calendarService.todoCollections();
        if (lists.isEmpty()) throw new IllegalStateException("No reminder lists found");
        if (listName == null || listName.isBlank()) return lists.get(0);
        return lists.stream()
                .filter(c -> c.displayName().equals(listName))
                .findFirst()
                .orElse(lists.get(0));
    }

    /**
     * rawUid から実リソースを引く。索引に無ければ一覧を取り直して索引を埋める
     * （別プロセスで作られたタスクを初回操作する場合に必要）。
     */
    private TodoRef resolveResource(String rawUid) throws Exception {
        TodoRef known = resourceIndex.get(rawUid);
        if (known != null) return known;

        cache = null;
        cachedTasks();

        TodoRef found = resourceIndex.get(rawUid);
        if (found == null) throw new IllegalArgumentException("Task not found: " + rawUid);
        return found;
    }

    private void invalidateCache() {
        cache = null;
    }
}
