package com.space.service;

import com.space.dto.CalendarEventDto;
import com.space.dto.CalendarEventWriteDto;
import com.space.service.ics.IcsFile;
import com.space.service.ics.IcsWriter;
import com.space.service.ics.VEventBlock;
import lombok.extern.slf4j.Slf4j;
import net.fortuna.ical4j.data.CalendarBuilder;
import net.fortuna.ical4j.model.Calendar;
import net.fortuna.ical4j.model.Component;
import net.fortuna.ical4j.model.DateTime;
import net.fortuna.ical4j.model.Period;
import net.fortuna.ical4j.model.PeriodList;
import net.fortuna.ical4j.model.component.VEvent;
import net.fortuna.ical4j.model.property.DtStart;
import net.fortuna.ical4j.model.property.RecurrenceId;
import net.fortuna.ical4j.model.property.Summary;
import net.fortuna.ical4j.model.property.Transp;
import net.fortuna.ical4j.model.property.Uid;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.hc.client5.http.classic.methods.HttpUriRequestBase;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;

@Slf4j
@Service
public class AppleCalendarService {

    private static final String BASE_URL = "https://caldav.icloud.com";
    static final String COMP_VEVENT = "VEVENT";
    static final String COMP_VTODO = "VTODO";
    private static final ZoneId JST = ZoneId.of("Asia/Tokyo");
    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter UTC_STAMP_FMT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");

    /** 繰り返しイベントの編集・削除の適用範囲。 */
    public enum EditScope {
        THIS, THIS_AND_FUTURE, ALL;

        public static EditScope from(String raw) {
            if (raw == null) return ALL;
            return switch (raw.trim().toLowerCase(Locale.ROOT)) {
                case "this", "single" -> THIS;
                case "thisandfuture", "this_and_future", "future" -> THIS_AND_FUTURE;
                default -> ALL;
            };
        }
    }

    @Value("${apple.calendar.username:}")
    private String username;

    @Value("${apple.calendar.password:}")
    private String password;

    /**
     * CalDAV コレクション 1 件。
     *
     * <p>{@code components} は supported-calendar-component-set の中身で、iCloud では
     * カレンダーが VEVENT、リマインダーリストが VTODO を返す。両者は同じ calendar-home に
     * 並んでいるため、これで区別しないとリマインダーリストがカレンダー一覧に混ざる。
     * サーバがこのプロパティを返さない場合は VEVENT とみなす。
     */
    record CollectionInfo(String url, String displayName, String color, Set<String> components) {
        boolean supports(String component) {
            return components.contains(component);
        }
    }

    /** rawUid から CalDAV リソースの実 URL と ETag を引くための索引。 */
    private record ResourceRef(String collectionUrl, String href, String etag, String calendarName) {}

    private static final long COLLECTIONS_TTL_MS = 30 * 60 * 1000;
    private volatile List<CollectionInfo> cachedCollections;
    private volatile long collectionsCachedAt = 0L;

    private static final long RANGE_TTL_MS = 5 * 60 * 1000;
    private record CachedRange(List<CalendarEventDto> events, long cachedAt) {}
    private final Map<String, CachedRange> rangeCache = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<List<CalendarEventDto>>> inFlightRangeFetches = new ConcurrentHashMap<>();

    /**
     * uid + ".ics" という URL 推測は、Apple 純正クライアントが作成したイベントでは外れる
     * （href のファイル名は UID と一致しないことがある）。REPORT の応答から実際の href と
     * ETag を控えておき、更新・削除ではそれを使う。
     */
    private final Map<String, ResourceRef> resourceIndex = new ConcurrentHashMap<>();

    private final ExecutorService caldavExecutor = Executors.newFixedThreadPool(32, r -> {
        Thread t = new Thread(r, "caldav-fetch");
        t.setDaemon(true);
        return t;
    });

    private PoolingHttpClientConnectionManager connManager;
    private CloseableHttpClient sharedHttpClient;

    @PostConstruct
    private void initHttpClient() {
        connManager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofSeconds(10))
                        .setSocketTimeout(Timeout.ofSeconds(15))
                        .build())
                .setMaxConnTotal(40)
                .setMaxConnPerRoute(32)
                .build();
        sharedHttpClient = HttpClients.custom()
                .setConnectionManager(connManager)
                .disableRedirectHandling()
                .build();
    }

    @PreDestroy
    private void destroyHttpClient() {
        try { sharedHttpClient.close(); } catch (Exception ignored) {}
        connManager.close();
    }

    boolean configured() {
        return !username.isBlank() && !password.isBlank();
    }

    // ── 取得 API ─────────────────────────────────────

    /**
     * 指定期間に重なるイベントを、複数日にまたがるものも1件のまま返す。
     * FullCalendar の event source が直接消費できる形。
     */
    public List<CalendarEventDto> getEventsInRange(LocalDate from, LocalDate toExclusive) {
        if (!configured()) {
            log.info("Apple Calendar credentials not configured — skipping CalDAV fetch.");
            return List.of();
        }
        return cachedRange(from, toExclusive);
    }

    public List<CalendarEventDto> getTodayEvents() {
        return getEventsForDate(LocalDate.now(JST));
    }

    public List<CalendarEventDto> getEventsForDate(LocalDate date) {
        if (!configured()) return List.of();
        return fanOutByDate(cachedRange(date, date.plusDays(1)), date, date.plusDays(1))
                .getOrDefault(date.toString(), List.of());
    }

    public Map<String, List<CalendarEventDto>> getEventsForMonth(int year, int month) {
        if (!configured()) return Map.of();
        YearMonth ym = YearMonth.of(year, month);
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.plusMonths(1).atDay(1);
        return fanOutByDate(cachedRange(from, to), from, to);
    }

    public Map<String, List<CalendarEventDto>> getEventsForWeek(LocalDate weekStart) {
        if (!configured()) return Map.of();
        LocalDate to = weekStart.plusDays(7);
        return fanOutByDate(cachedRange(weekStart, to), weekStart, to);
    }

    public List<Map<String, String>> getCollections() {
        if (!configured()) return List.of();
        try {
            return eventCollections().stream()
                    .map(c -> Map.of(
                            "name", c.displayName(),
                            "color", c.color() != null ? c.color() : "#4a9eff"))
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to fetch collections: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 期間内のオカレンスを日付キーごとに展開する（旧 API 互換表現）。
     * 複数日イベントは各日に1件ずつ複製され、中日は終日扱いになる。
     */
    Map<String, List<CalendarEventDto>> fanOutByDate(List<CalendarEventDto> events,
                                                     LocalDate from, LocalDate toExclusive) {
        Map<String, List<CalendarEventDto>> result = new HashMap<>();
        for (CalendarEventDto e : events) {
            LocalDate start = LocalDate.parse(e.getDate());
            LocalDate endInclusive = e.getEndDate() != null ? LocalDate.parse(e.getEndDate()) : start;
            if (endInclusive.isBefore(start)) endInclusive = start;

            boolean multiDay = endInclusive.isAfter(start);
            for (LocalDate d = start; !d.isAfter(endInclusive); d = d.plusDays(1)) {
                if (d.isBefore(from) || !d.isBefore(toExclusive)) continue;
                CalendarEventDto copy = cloneForDay(e, d, multiDay);
                result.computeIfAbsent(d.toString(), k -> new ArrayList<>()).add(copy);
            }
        }
        for (List<CalendarEventDto> list : result.values()) {
            list.sort(Comparator.comparing(e -> e.getStartTime() == null ? "" : e.getStartTime()));
        }
        return result;
    }

    private CalendarEventDto cloneForDay(CalendarEventDto e, LocalDate day, boolean multiDay) {
        return CalendarEventDto.builder()
                .uid(e.getRawUid() + "_" + day)
                .rawUid(e.getRawUid())
                .title(e.getTitle())
                .start(e.getStart())
                .end(e.getEnd())
                .allDay(multiDay || e.isAllDay())
                .calendarName(e.getCalendarName())
                .calendarColor(e.getCalendarColor())
                .tagColor(e.getTagColor())
                .location(e.getLocation())
                .url(e.getUrl())
                .notes(e.getNotes())
                .rrule(e.getRrule())
                .recurring(e.isRecurring())
                .recurrenceId(e.getRecurrenceId())
                .overridden(e.isOverridden())
                .reminders(e.getReminders())
                .etag(e.getEtag())
                .date(day.toString())
                .endDate(e.getEndDate())
                .startTime(multiDay ? null : e.getStartTime())
                .endTime(multiDay ? null : e.getEndTime())
                .build();
    }

    // ── キャッシュ付き期間取得 ─────────────────────────

    private List<CalendarEventDto> cachedRange(LocalDate from, LocalDate toExclusive) {
        String key = from + "|" + toExclusive;
        CachedRange cached = rangeCache.get(key);
        if (cached != null && (System.currentTimeMillis() - cached.cachedAt()) < RANGE_TTL_MS) {
            return cached.events();
        }
        return coalesce(inFlightRangeFetches, key, () -> {
            List<CalendarEventDto> events = fetchRange(from, toExclusive);
            rangeCache.put(key, new CachedRange(events, System.currentTimeMillis()));
            return events;
        });
    }

    /**
     * 同一キーへの同時リクエストを 1 回の CalDAV 取得に合流させる。
     * キャッシュ失効直後の一斉リクエストでコネクションプールが枯渇するのを防ぐ。
     */
    private <T> T coalesce(Map<String, CompletableFuture<T>> inFlight, String key, Supplier<T> loader) {
        boolean[] isLeader = {false};
        CompletableFuture<T> future = inFlight.computeIfAbsent(key, k -> {
            isLeader[0] = true;
            return new CompletableFuture<>();
        });
        if (isLeader[0]) {
            try {
                future.complete(loader.get());
            } catch (Throwable t) {
                future.completeExceptionally(t);
            } finally {
                inFlight.remove(key, future);
            }
        }
        try {
            return future.join();
        } catch (java.util.concurrent.CompletionException ce) {
            Throwable cause = ce.getCause() != null ? ce.getCause() : ce;
            throw new RuntimeException("Apple Calendar fetch failed: " + cause.getMessage(), cause);
        }
    }

    private List<CalendarEventDto> fetchRange(LocalDate from, LocalDate toExclusive) {
        try {
            List<CollectionInfo> collections = eventCollections();
            if (collections.isEmpty()) return List.of();

            Map<String, CalendarEventDto> merged = new ConcurrentHashMap<>();
            List<CompletableFuture<Void>> futures = collections.stream()
                    .map(info -> CompletableFuture.runAsync(() -> {
                        try {
                            for (CalendarEventDto e : queryRange(info, from, toExclusive)) {
                                merged.putIfAbsent(e.getUid(), e);
                            }
                        } catch (Exception ex) {
                            log.warn("CalDAV range query failed for collection {} ({}): {}",
                                    info.displayName(), info.url(), ex.getMessage(), ex);
                        }
                    }, caldavExecutor))
                    .toList();
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            List<CalendarEventDto> events = new ArrayList<>(merged.values());
            events.sort(Comparator.comparing(CalendarEventDto::getStart,
                    Comparator.nullsLast(Comparator.naturalOrder())));
            return List.copyOf(events);

        } catch (Exception e) {
            log.error("Apple Calendar range fetch failed: {}", e.getMessage(), e);
            return List.of();
        }
    }

    private void invalidateCaches() {
        rangeCache.clear();
    }

    // ── コレクション探索（キャッシュ付き） ───────────────

    /** VEVENT を扱えるコレクション（＝カレンダー）。 */
    private List<CollectionInfo> eventCollections() throws Exception {
        return getCachedCollections().stream().filter(c -> c.supports(COMP_VEVENT)).toList();
    }

    /**
     * VTODO を扱えるコレクション（＝リマインダーリスト）。
     * タスク機能（{@link TaskService}）から利用する。
     */
    List<CollectionInfo> todoCollections() throws Exception {
        return getCachedCollections().stream().filter(c -> c.supports(COMP_VTODO)).toList();
    }

    private synchronized List<CollectionInfo> getCachedCollections() throws Exception {
        long now = System.currentTimeMillis();
        if (cachedCollections != null && (now - collectionsCachedAt) < COLLECTIONS_TTL_MS) {
            return cachedCollections;
        }
        List<CollectionInfo> collections = discoverCollections();
        if (collections.isEmpty() && cachedCollections != null) {
            return cachedCollections;
        }
        cachedCollections = collections;
        collectionsCachedAt = now;
        return collections;
    }

    private List<CollectionInfo> discoverCollections() throws Exception {
        String principalUrl = discoverPrincipal();
        if (principalUrl == null) return List.of();
        String calHome = getCalendarHome(principalUrl);
        if (calHome == null) return List.of();
        return listCollections(calHome);
    }

    private String discoverPrincipal() throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:">
              <d:prop><d:current-user-principal/></d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav("PROPFIND", BASE_URL + "/.well-known/caldav", body, "0");
        return xml != null ? extractFirstHref(xml, "current-user-principal") : null;
    }

    private String getCalendarHome(String principalUrl) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop><c:calendar-home-set/></d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav("PROPFIND", principalUrl, body, "0");
        return xml != null ? extractFirstHref(xml, "calendar-home-set") : null;
    }

    private List<CollectionInfo> listCollections(String calHome) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"
                        xmlns:ical="http://apple.com/ns/ical/">
              <d:prop>
                <d:resourcetype/>
                <d:displayname/>
                <ical:calendar-color/>
                <c:supported-calendar-component-set/>
              </d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav("PROPFIND", calHome, body, "1");
        if (xml == null) return List.of();

        List<CollectionInfo> infos = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList responses = doc.getElementsByTagNameNS("DAV:", "response");
        for (int i = 0; i < responses.getLength(); i++) {
            Element resp = (Element) responses.item(i);

            NodeList calType = resp.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar");
            if (calType.getLength() == 0) continue;

            NodeList hrefNodes = resp.getElementsByTagNameNS("DAV:", "href");
            if (hrefNodes.getLength() == 0) continue;
            String href = absolutize(hrefNodes.item(0).getTextContent().trim());

            String displayName = "";
            NodeList nameNodes = resp.getElementsByTagNameNS("DAV:", "displayname");
            if (nameNodes.getLength() > 0) displayName = nameNodes.item(0).getTextContent().trim();

            String color = null;
            NodeList colorNodes = resp.getElementsByTagNameNS("http://apple.com/ns/ical/", "calendar-color");
            if (colorNodes.getLength() > 0) {
                String raw = colorNodes.item(0).getTextContent().trim();
                if (raw.startsWith("#") && raw.length() == 9) color = raw.substring(0, 7);
                else if (raw.startsWith("#") && raw.length() == 7) color = raw;
            }

            Set<String> components = new LinkedHashSet<>();
            NodeList compNodes = resp.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "comp");
            for (int c = 0; c < compNodes.getLength(); c++) {
                String name = ((Element) compNodes.item(c)).getAttribute("name");
                if (name != null && !name.isBlank()) components.add(name.trim().toUpperCase(Locale.ROOT));
            }
            // プロパティ非対応のサーバでも従来どおりカレンダーとして扱えるようにする
            if (components.isEmpty()) components.add(COMP_VEVENT);

            log.debug("Discovered calendar collection: href={}, displayName={}, components={}",
                    href, displayName, components);
            infos.add(new CollectionInfo(href, displayName, color, Set.copyOf(components)));
        }
        return infos;
    }

    // ── CalDAV クエリ ────────────────────────────────

    private List<CalendarEventDto> queryRange(CollectionInfo info,
                                              LocalDate from, LocalDate toExclusive) throws Exception {
        String start = from.atStartOfDay(JST).withZoneSameInstant(UTC).format(UTC_STAMP_FMT);
        String end = toExclusive.atStartOfDay(JST).withZoneSameInstant(UTC).format(UTC_STAMP_FMT);

        String body = String.format("""
            <?xml version="1.0" encoding="utf-8"?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:getetag/>
                <c:calendar-data/>
              </d:prop>
              <c:filter>
                <c:comp-filter name="VCALENDAR">
                  <c:comp-filter name="VEVENT">
                    <c:time-range start="%s" end="%s"/>
                  </c:comp-filter>
                </c:comp-filter>
              </c:filter>
            </c:calendar-query>
            """, start, end);

        String xml = sendWebDav("REPORT", info.url(), body, "1");
        if (xml == null) return List.of();

        net.fortuna.ical4j.model.Date rangeStart = new DateTime(
                java.util.Date.from(from.atStartOfDay(JST).toInstant()));
        net.fortuna.ical4j.model.Date rangeEnd = new DateTime(
                java.util.Date.from(toExclusive.atStartOfDay(JST).toInstant()));

        List<CalendarEventDto> events = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList responses = doc.getElementsByTagNameNS("DAV:", "response");
        for (int i = 0; i < responses.getLength(); i++) {
            Element resp = (Element) responses.item(i);

            String href = firstChildText(resp, "DAV:", "href");
            String etag = stripQuotes(firstChildText(resp, "DAV:", "getetag"));
            String icsData = firstChildText(resp, "urn:ietf:params:xml:ns:caldav", "calendar-data");
            if (icsData == null || icsData.isBlank()) continue;

            events.addAll(parseOccurrences(icsData, info, absolutize(href), etag, rangeStart, rangeEnd));
        }
        return events;
    }

    // ── iCalendar パース ─────────────────────────────

    /**
     * 1 リソース分の ICS から、指定期間に重なるオカレンスを取り出す。
     *
     * <p>役割分担: 繰り返し展開（RRULE / EXDATE / RECURRENCE-ID）は ical4j に任せ、
     * プロパティの読み出しは行ベースの {@link IcsFile} で行う。ical4j のモデルを経由すると
     * 未対応のパラメータが落ちるため、表示に使う値は生テキストから取る。
     */
    /** テスト用の入口。コレクション情報を名前と色だけで指定する。 */
    List<CalendarEventDto> parseOccurrences(String icsData, String calendarName, String calendarColor,
                                            net.fortuna.ical4j.model.Date rangeStart,
                                            net.fortuna.ical4j.model.Date rangeEnd) {
        return parseOccurrences(icsData, new CollectionInfo("", calendarName, calendarColor, Set.of(COMP_VEVENT)),
                null, null, rangeStart, rangeEnd);
    }

    List<CalendarEventDto> parseOccurrences(String icsData, CollectionInfo info,
                                            String href, String etag,
                                            net.fortuna.ical4j.model.Date rangeStart,
                                            net.fortuna.ical4j.model.Date rangeEnd) {
        List<CalendarEventDto> result = new ArrayList<>();
        try {
            // Apple独自のRELATED-TO;RELTYPE=X-CALENDARSERVER-RECURRENCE-SETは、ical4jが
            // 例外も出さず該当VEVENTを丸ごと読み飛ばしてしまうため、パース前に除去する。
            String sanitizedIcs = icsData.replaceAll(
                    "(?m)^RELATED-TO[^\\r\\n]*\\r?\\n(?:[ \\t][^\\r\\n]*\\r?\\n)*", "");

            IcsFile raw = IcsFile.parse(icsData);
            Map<String, VEventBlock> blocksByRecurrenceId = new HashMap<>();
            VEventBlock masterBlock = null;
            for (VEventBlock block : raw.events()) {
                String recurValue = block.propValue("RECURRENCE-ID");
                if (recurValue == null) {
                    masterBlock = block;
                } else {
                    String canonical = canonicalRecurrenceId(
                            recurValue, block.paramValue("RECURRENCE-ID", "TZID"));
                    if (canonical != null) blocksByRecurrenceId.put(canonical, block);
                }
            }

            Calendar cal = new CalendarBuilder().build(new StringReader(sanitizedIcs));

            // RECURRENCE-ID で上書きされている回は、マスターの RRULE 展開結果から除外する
            // （EXDATE に載らない場合があるため）。
            Map<String, Set<Long>> overriddenInstantsByUid = new HashMap<>();
            for (Component comp : cal.getComponents(Component.VEVENT)) {
                RecurrenceId recurId = ((VEvent) comp).getRecurrenceId();
                if (recurId == null) continue;
                Uid uidProp = ((VEvent) comp).getUid();
                overriddenInstantsByUid
                        .computeIfAbsent(uidProp != null ? uidProp.getValue() : "", k -> new HashSet<>())
                        .add(recurId.getDate().getTime());
            }

            for (Component comp : cal.getComponents(Component.VEVENT)) {
                VEvent event = (VEvent) comp;
                DtStart dtStart = event.getStartDate();
                if (dtStart == null) continue;

                Uid uidProp = event.getUid();
                String uid = uidProp != null ? uidProp.getValue() : UUID.randomUUID().toString();

                Summary summaryProp = event.getSummary();
                String title = summaryProp != null ? summaryProp.getValue() : "（タイトルなし）";

                boolean allDay = !(dtStart.getDate() instanceof DateTime);
                RecurrenceId ownRecurrenceId = event.getRecurrenceId();
                boolean isMaster = ownRecurrenceId == null;
                Set<Long> overridden = overriddenInstantsByUid.getOrDefault(uid, Set.of());

                VEventBlock block = isMaster
                        ? masterBlock
                        : blocksByRecurrenceId.get(canonicalRecurrenceId(ownRecurrenceId, allDay));
                if (block == null) block = masterBlock;

                String rrule = block != null ? block.propValue("RRULE") : null;
                boolean recurring = rrule != null || !isMaster
                        || (masterBlock != null && masterBlock.propValue("RRULE") != null);

                for (Period period : consumedTime(event, rangeStart, rangeEnd)) {
                    if (isMaster && overridden.contains(period.getStart().getTime())) continue;

                    ZonedDateTime pStart = period.getStart().toInstant().atZone(allDay ? UTC : JST);
                    ZonedDateTime pEnd = period.getEnd().toInstant().atZone(allDay ? UTC : JST);

                    String recurrenceId = !isMaster
                            ? canonicalRecurrenceId(ownRecurrenceId, allDay)
                            : (recurring ? canonicalOf(pStart, allDay) : null);

                    result.add(buildDto(uid, title, allDay, pStart, pEnd, info, block,
                            rrule, recurring, recurrenceId, !isMaster, href, etag));
                }
            }
        } catch (Exception e) {
            log.warn("iCalendar parse error — raw ICS was:\n{}", icsData, e);
        }

        if (href != null && !result.isEmpty()) {
            resourceIndex.put(result.get(0).getRawUid(),
                    new ResourceRef(info.url(), href, etag, info.displayName()));
        }
        return result;
    }

    /**
     * getConsumedTime() は TRANSP:TRANSPARENT のイベントを空き時間扱いで除外する
     * （空き/busy 集計向けの実装のため）。カレンダー表示では終日イベント等の
     * TRANSPARENT 指定も見せたいので、一時的にプロパティを外してから計算する。
     */
    private List<Period> consumedTime(VEvent event,
                                      net.fortuna.ical4j.model.Date rangeStart,
                                      net.fortuna.ical4j.model.Date rangeEnd) {
        Transp transp = event.getTransparency();
        boolean transparent = transp != null && transp.equals(Transp.TRANSPARENT);
        if (transparent) event.getProperties().remove(transp);
        try {
            PeriodList periods = event.getConsumedTime(rangeStart, rangeEnd);
            List<Period> result = new ArrayList<>();
            for (Object obj : periods) result.add((Period) obj);
            return result;
        } finally {
            if (transparent) event.getProperties().add(transp);
        }
    }

    private CalendarEventDto buildDto(String uid, String title, boolean allDay,
                                      ZonedDateTime pStart, ZonedDateTime pEnd,
                                      CollectionInfo info, VEventBlock block,
                                      String rrule, boolean recurring, String recurrenceId,
                                      boolean overridden, String href, String etag) {
        LocalDate startDate = pStart.toLocalDate();
        String start;
        String end;
        LocalDate endInclusive;

        if (allDay) {
            LocalDate endExclusive = pEnd.toLocalDate();
            if (!endExclusive.isAfter(startDate)) endExclusive = startDate.plusDays(1);
            start = startDate.toString();
            end = endExclusive.toString();
            endInclusive = endExclusive.minusDays(1);
        } else {
            start = pStart.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            end = pEnd.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            endInclusive = pEnd.toLocalDate();
            // 24:00 ちょうどに終わる予定は前日終了として扱う（日跨ぎ表示を避ける）
            if (pEnd.toLocalTime().equals(java.time.LocalTime.MIDNIGHT) && endInclusive.isAfter(startDate)) {
                endInclusive = endInclusive.minusDays(1);
            }
        }

        return CalendarEventDto.builder()
                .uid(uid + "_" + start)
                .rawUid(uid)
                .title(title)
                .start(start)
                .end(end)
                .allDay(allDay)
                .calendarName(info.displayName())
                .calendarColor(info.color())
                .tagColor(block != null ? block.propValue("X-APPLE-CALENDAR-COLOR") : null)
                .location(text(block, "LOCATION"))
                .url(text(block, "URL"))
                .notes(text(block, "DESCRIPTION"))
                .rrule(rrule)
                .recurring(recurring)
                .recurrenceId(recurrenceId)
                .overridden(overridden)
                .reminders(remindersOf(block))
                .etag(etag)
                .date(startDate.toString())
                .endDate(endInclusive.toString())
                .startTime(allDay ? null : pStart.format(TIME_FMT))
                .endTime(allDay ? null : pEnd.format(TIME_FMT))
                .build();
    }

    private static String text(VEventBlock block, String name) {
        if (block == null) return null;
        String v = block.propValue(name);
        return v == null ? null : IcsWriter.unescapeText(v);
    }

    /** VALARM の TRIGGER から「開始の何分前か」を取り出す。相対トリガーのみ対象。 */
    private static List<Integer> remindersOf(VEventBlock block) {
        if (block == null) return List.of();
        List<Integer> result = new ArrayList<>();
        for (String line : block.lines()) {
            int colon = line.indexOf(':');
            if (colon < 0) continue;
            String name = line.substring(0, Math.min(colon, indexOfOrEnd(line, ';')));
            if (!name.equalsIgnoreCase("TRIGGER")) continue;
            Integer minutes = parseTriggerMinutes(line.substring(colon + 1).trim());
            if (minutes != null) result.add(minutes);
        }
        return result;
    }

    private static int indexOfOrEnd(String s, char c) {
        int i = s.indexOf(c);
        return i < 0 ? s.length() : i;
    }

    /** "-PT30M" → 30、"PT15M" → -15（開始後15分）。絶対日時トリガーは扱わない。 */
    static Integer parseTriggerMinutes(String value) {
        boolean before = value.startsWith("-");
        String iso = value.startsWith("-") || value.startsWith("+") ? value.substring(1) : value;
        if (!iso.startsWith("P")) return null;
        try {
            long minutes = java.time.Duration.parse(iso.contains("T") || !iso.contains("D")
                    ? iso
                    : iso.replace("P", "P")).toMinutes();
            return (int) (before ? minutes : -minutes);
        } catch (Exception e) {
            return null;
        }
    }

    // ── RECURRENCE-ID の正規化 ────────────────────────

    /**
     * RECURRENCE-ID / EXDATE の値を、比較・往復に使える正準形へ揃える。
     * 終日は "yyyyMMdd"、時間指定は UTC の "yyyyMMdd'T'HHmmss'Z'"。
     *
     * <p>Apple は TZID 付きで書き、こちらは UTC で書くため、文字列一致では突き合わせられない。
     * 常にこの形へ寄せてから比較する。
     */
    static String canonicalRecurrenceId(String rawValue, String tzid) {
        if (rawValue == null) return null;
        String v = rawValue.trim();
        if (v.matches("\\d{8}")) return v;
        try {
            boolean utc = v.endsWith("Z");
            String core = utc ? v.substring(0, v.length() - 1) : v;
            LocalDateTime ldt = LocalDateTime.parse(core, IcsWriter.LOCAL_DT_FMT);
            ZoneId zone = utc ? UTC : (tzid != null ? ZoneId.of(tzid) : JST);
            return ldt.atZone(zone).withZoneSameInstant(UTC).format(UTC_STAMP_FMT);
        } catch (Exception e) {
            return v;
        }
    }

    private static String canonicalRecurrenceId(RecurrenceId recurId, boolean allDay) {
        if (recurId == null) return null;
        ZonedDateTime zdt = recurId.getDate().toInstant().atZone(allDay ? UTC : JST);
        return canonicalOf(zdt, allDay);
    }

    private static String canonicalOf(ZonedDateTime moment, boolean allDay) {
        return allDay
                ? moment.toLocalDate().format(IcsWriter.DATE_FMT)
                : moment.withZoneSameInstant(UTC).format(UTC_STAMP_FMT);
    }

    private static boolean isDateOnly(String canonical) {
        return canonical != null && canonical.matches("\\d{8}");
    }

    private static String recurrenceIdLine(String canonical) {
        return isDateOnly(canonical)
                ? "RECURRENCE-ID;VALUE=DATE:" + canonical
                : "RECURRENCE-ID:" + canonical;
    }

    private static String exDateLine(String canonical) {
        return isDateOnly(canonical)
                ? "EXDATE;VALUE=DATE:" + canonical
                : "EXDATE:" + canonical;
    }

    // ── 書き込み API ─────────────────────────────────

    public void createEvent(CalendarEventWriteDto dto) throws Exception {
        requireConfigured();

        String uid = UUID.randomUUID().toString().toUpperCase(Locale.ROOT);
        CollectionInfo target = resolveCollection(dto.getCalendarName());
        String eventUrl = joinPath(target.url(), uid + ".ics");

        String ics = IcsWriter.wrapCalendar(List.of(IcsWriter.newEvent(uid, dto, JST)));
        putIcs(eventUrl, ics, null);

        resourceIndex.put(uid, new ResourceRef(target.url(), eventUrl, null, target.displayName()));
        invalidateCaches();
    }

    /**
     * 既存イベントを更新する。
     *
     * <p>既存 .ics を取得してから必要な行だけ差し替えるため、このアプリが扱わない
     * プロパティ（出席者・添付・独自拡張など）は保持される。繰り返しイベントでは
     * {@code editScope} に応じて、当該回のみ／以降すべて／全体を書き分ける。
     */
    public void updateEvent(String rawUid, CalendarEventWriteDto dto) throws Exception {
        requireConfigured();

        ResourceRef ref = resolveResource(rawUid, dto.getCalendarName());
        FetchedIcs fetched = getIcs(ref.href());
        IcsFile file = IcsFile.parse(fetched.body());
        VEventBlock master = file.master();
        if (master == null) throw new IllegalStateException("VEVENT not found in " + ref.href());

        EditScope scope = EditScope.from(dto.getEditScope());
        String recurrenceId = dto.getRecurrenceId();
        boolean recurringSeries = master.propValue("RRULE") != null;
        if (!recurringSeries || recurrenceId == null) scope = EditScope.ALL;

        String ifMatch = dto.getEtag() != null ? dto.getEtag() : fetched.etag();

        switch (scope) {
            case ALL -> {
                IcsWriter.applyFields(master, dto, JST);
                putIcs(ref.href(), file.render(), ifMatch);
            }
            case THIS -> {
                VEventBlock override = findOverride(file, recurrenceId);
                if (override == null) {
                    override = master.copy();
                    override.removeProp("RRULE");
                    override.removeProp("EXDATE");
                    override.removeProp("RDATE");
                    override.setProp("RECURRENCE-ID", recurrenceIdLine(recurrenceId));
                    file.addEvent(override);
                }
                // 上書き VEVENT は単一回を表すので、RRULE を持たせてはいけない。
                // クライアントが元の繰り返し設定を送ってきても落とす。
                IcsWriter.applyFields(override, copyWithRrule(dto, null), JST);
                override.setProp("RECURRENCE-ID", recurrenceIdLine(recurrenceId));
                putIcs(ref.href(), file.render(), ifMatch);
            }
            case THIS_AND_FUTURE -> {
                // 既存シリーズを対象回の直前で打ち切り、対象回以降は別 UID の新しいシリーズにする。
                // Apple Calendar / Google Calendar と同じ分割方式。
                truncateSeriesBefore(file, master, recurrenceId);
                dropOverridesFrom(file, recurrenceId);

                if (file.master() != null && seriesIsEmpty(master, recurrenceId)) {
                    deleteResource(ref.href(), ifMatch);
                } else {
                    putIcs(ref.href(), file.render(), ifMatch);
                }

                String newUid = UUID.randomUUID().toString().toUpperCase(Locale.ROOT);
                CalendarEventWriteDto tail = copyWithRrule(dto, dto.getRrule());
                CollectionInfo target = resolveCollection(
                        dto.getCalendarName() != null ? dto.getCalendarName() : ref.calendarName());
                String newUrl = joinPath(target.url(), newUid + ".ics");
                putIcs(newUrl, IcsWriter.wrapCalendar(List.of(IcsWriter.newEvent(newUid, tail, JST))), null);
                resourceIndex.put(newUid, new ResourceRef(target.url(), newUrl, null, target.displayName()));
            }
        }

        invalidateCaches();
    }

    public void deleteEvent(String rawUid, String calendarName,
                            String recurrenceId, String editScopeRaw) throws Exception {
        requireConfigured();

        ResourceRef ref = resolveResource(rawUid, calendarName);
        EditScope scope = EditScope.from(editScopeRaw);

        if (scope == EditScope.ALL || recurrenceId == null) {
            deleteResource(ref.href(), null);
            resourceIndex.remove(rawUid);
            invalidateCaches();
            return;
        }

        FetchedIcs fetched = getIcs(ref.href());
        IcsFile file = IcsFile.parse(fetched.body());
        VEventBlock master = file.master();
        if (master == null || master.propValue("RRULE") == null) {
            deleteResource(ref.href(), fetched.etag());
            resourceIndex.remove(rawUid);
            invalidateCaches();
            return;
        }

        if (scope == EditScope.THIS) {
            master.addLine(exDateLine(recurrenceId));
            IcsWriter.touch(master);
            VEventBlock override = findOverride(file, recurrenceId);
            if (override != null) file.removeEvent(override);
        } else {
            truncateSeriesBefore(file, master, recurrenceId);
            dropOverridesFrom(file, recurrenceId);
        }

        if (seriesIsEmpty(master, recurrenceId)) {
            deleteResource(ref.href(), fetched.etag());
            resourceIndex.remove(rawUid);
        } else {
            putIcs(ref.href(), file.render(), fetched.etag());
        }
        invalidateCaches();
    }

    // ── 書き込みの補助 ────────────────────────────────

    private VEventBlock findOverride(IcsFile file, String canonicalRecurrenceId) {
        for (VEventBlock block : file.events()) {
            String v = block.propValue("RECURRENCE-ID");
            if (v == null) continue;
            String canonical = canonicalRecurrenceId(v, block.paramValue("RECURRENCE-ID", "TZID"));
            if (Objects.equals(canonical, canonicalRecurrenceId)) return block;
        }
        return null;
    }

    /** マスターの RRULE に UNTIL を設定し、対象回の直前でシリーズを打ち切る。 */
    private void truncateSeriesBefore(IcsFile file, VEventBlock master, String recurrenceId) {
        String rrule = master.propValue("RRULE");
        if (rrule == null) return;

        String until;
        if (isDateOnly(recurrenceId)) {
            LocalDate d = LocalDate.parse(recurrenceId, IcsWriter.DATE_FMT).minusDays(1);
            until = d.format(IcsWriter.DATE_FMT);
        } else {
            ZonedDateTime z = LocalDateTime.parse(recurrenceId.substring(0, recurrenceId.length() - 1),
                            IcsWriter.LOCAL_DT_FMT)
                    .atZone(UTC).minusSeconds(1);
            until = z.format(UTC_STAMP_FMT);
        }

        List<String> parts = new ArrayList<>();
        for (String part : rrule.split(";")) {
            String upper = part.toUpperCase(Locale.ROOT);
            // UNTIL と COUNT は排他。打ち切りを効かせるため COUNT は落とす。
            if (upper.startsWith("UNTIL=") || upper.startsWith("COUNT=")) continue;
            if (!part.isBlank()) parts.add(part);
        }
        parts.add("UNTIL=" + until);
        master.setProp("RRULE", "RRULE:" + String.join(";", parts));
        IcsWriter.touch(master);
    }

    /** 打ち切り位置以降にある上書き VEVENT を取り除く。 */
    private void dropOverridesFrom(IcsFile file, String recurrenceId) {
        for (VEventBlock block : new ArrayList<>(file.events())) {
            String v = block.propValue("RECURRENCE-ID");
            if (v == null) continue;
            String canonical = canonicalRecurrenceId(v, block.paramValue("RECURRENCE-ID", "TZID"));
            if (canonical != null && canonical.compareTo(recurrenceId) >= 0) file.removeEvent(block);
        }
    }

    /** UNTIL が DTSTART より前になり、1 回も残らなくなったか。 */
    private boolean seriesIsEmpty(VEventBlock master, String recurrenceId) {
        String dtStart = master.propValue("DTSTART");
        if (dtStart == null) return false;
        String canonicalStart = canonicalRecurrenceId(dtStart, master.paramValue("DTSTART", "TZID"));
        return canonicalStart != null && canonicalStart.compareTo(recurrenceId) >= 0;
    }

    private CalendarEventWriteDto copyWithRrule(CalendarEventWriteDto src, String rrule) {
        CalendarEventWriteDto copy = new CalendarEventWriteDto();
        copy.setTitle(src.getTitle());
        copy.setStart(src.getStart());
        copy.setEnd(src.getEnd());
        copy.setAllDay(src.isAllDay());
        copy.setCalendarName(src.getCalendarName());
        copy.setLocation(src.getLocation());
        copy.setUrl(src.getUrl());
        copy.setNotes(src.getNotes());
        copy.setTagColor(src.getTagColor());
        copy.setReminders(src.getReminders());
        copy.setRrule(rrule);
        return copy;
    }

    void requireConfigured() throws Exception {
        if (!configured()) throw new IllegalStateException("Apple Calendar credentials not configured");
    }

    private CollectionInfo resolveCollection(String calendarName) throws Exception {
        List<CollectionInfo> collections = eventCollections();
        if (collections.isEmpty()) throw new IllegalStateException("No calendar collections found");
        if (calendarName == null || calendarName.isBlank()) return collections.get(0);
        return collections.stream()
                .filter(c -> c.displayName().equals(calendarName))
                .findFirst()
                .orElse(collections.get(0));
    }

    /**
     * rawUid から実リソースを引く。REPORT で索引済みならそれを使い、未知なら
     * UID 指定の calendar-query で href を引き直す。最後の手段としてのみ
     * "コレクション URL + uid.ics" を推測する。
     */
    private ResourceRef resolveResource(String rawUid, String calendarName) throws Exception {
        ResourceRef known = resourceIndex.get(rawUid);
        if (known != null) return known;

        List<CollectionInfo> collections = eventCollections();
        if (collections.isEmpty()) throw new IllegalStateException("No calendar collections found");

        List<CollectionInfo> ordered = new ArrayList<>();
        if (calendarName != null && !calendarName.isBlank()) {
            collections.stream().filter(c -> c.displayName().equals(calendarName)).forEach(ordered::add);
        }
        collections.stream().filter(c -> !ordered.contains(c)).forEach(ordered::add);

        for (CollectionInfo info : ordered) {
            ResourceRef found = lookupByUid(info, rawUid);
            if (found != null) {
                resourceIndex.put(rawUid, found);
                return found;
            }
        }

        CollectionInfo fallback = resolveCollection(calendarName);
        return new ResourceRef(fallback.url(), joinPath(fallback.url(), rawUid + ".ics"),
                null, fallback.displayName());
    }

    private ResourceRef lookupByUid(CollectionInfo info, String rawUid) {
        String body = String.format("""
            <?xml version="1.0" encoding="utf-8"?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop><d:getetag/></d:prop>
              <c:filter>
                <c:comp-filter name="VCALENDAR">
                  <c:comp-filter name="VEVENT">
                    <c:prop-filter name="UID">
                      <c:text-match collation="i;octet">%s</c:text-match>
                    </c:prop-filter>
                  </c:comp-filter>
                </c:comp-filter>
              </c:filter>
            </c:calendar-query>
            """, escapeXml(rawUid));
        try {
            String xml = sendWebDav("REPORT", info.url(), body, "1");
            if (xml == null) return null;
            Document doc = parseXml(xml);
            NodeList responses = doc.getElementsByTagNameNS("DAV:", "response");
            for (int i = 0; i < responses.getLength(); i++) {
                Element resp = (Element) responses.item(i);
                String href = firstChildText(resp, "DAV:", "href");
                if (href == null || href.isBlank()) continue;
                String etag = stripQuotes(firstChildText(resp, "DAV:", "getetag"));
                return new ResourceRef(info.url(), absolutize(href), etag, info.displayName());
            }
        } catch (Exception e) {
            log.warn("UID lookup failed in {}: {}", info.displayName(), e.getMessage());
        }
        return null;
    }

    // ── CalDAV の HTTP 操作 ──────────────────────────

    record FetchedIcs(String body, String etag) {}

    FetchedIcs getIcs(String url) throws Exception {
        HttpUriRequestBase req = new HttpUriRequestBase("GET", URI.create(url));
        req.setHeader("Authorization", basicAuth());
        return sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            String body = resp.getEntity() != null
                    ? EntityUtils.toString(resp.getEntity(), StandardCharsets.UTF_8) : null;
            if (status < 200 || status >= 300) {
                throw new java.io.IOException("CalDAV GET failed: " + status + " " + url);
            }
            var etagHeader = resp.getFirstHeader("ETag");
            return new FetchedIcs(body, etagHeader != null ? stripQuotes(etagHeader.getValue()) : null);
        });
    }

    void putIcs(String url, String ics, String ifMatch) throws Exception {
        HttpUriRequestBase req = new HttpUriRequestBase("PUT", URI.create(url));
        req.setHeader("Authorization", basicAuth());
        req.setHeader("Content-Type", "text/calendar; charset=utf-8");
        if (ifMatch != null && !ifMatch.isBlank()) {
            req.setHeader("If-Match", "\"" + ifMatch + "\"");
        }
        req.setEntity(new StringEntity(ics, ContentType.create("text/calendar", StandardCharsets.UTF_8)));

        sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            EntityUtils.consume(resp.getEntity());
            if (status == 412) {
                throw new java.io.IOException("CONFLICT");
            }
            if (status < 200 || status >= 300) {
                throw new java.io.IOException("CalDAV PUT failed: " + status);
            }
            return null;
        });
    }

    void deleteResource(String url, String ifMatch) throws Exception {
        HttpUriRequestBase req = new HttpUriRequestBase("DELETE", URI.create(url));
        req.setHeader("Authorization", basicAuth());
        if (ifMatch != null && !ifMatch.isBlank()) {
            req.setHeader("If-Match", "\"" + ifMatch + "\"");
        }
        sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            EntityUtils.consume(resp.getEntity());
            if (status == 412) throw new java.io.IOException("CONFLICT");
            if (status == 404 || status == 410) return null;
            if (status < 200 || status >= 300) {
                throw new java.io.IOException("CalDAV DELETE failed: " + status);
            }
            return null;
        });
    }

    private static final String REDIRECT_PREFIX = "REDIRECT:";

    String sendWebDav(String method, String url, String body, String depth) throws Exception {
        String currentUrl = url;
        for (int hop = 0; hop < 6; hop++) {
            final String reqUrl = currentUrl;
            HttpUriRequestBase req = new HttpUriRequestBase(method, URI.create(reqUrl));
            req.setHeader("Authorization", basicAuth());
            req.setHeader("Depth", depth);
            req.setHeader("Content-Type", "application/xml; charset=utf-8");
            if (body != null) {
                req.setEntity(new StringEntity(body, ContentType.create("application/xml", StandardCharsets.UTF_8)));
            }
            String result = sharedHttpClient.execute(req, resp -> {
                int status = resp.getCode();
                if (status == 207) {
                    return EntityUtils.toString(resp.getEntity(), StandardCharsets.UTF_8);
                }
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    var loc = resp.getFirstHeader("Location");
                    EntityUtils.consume(resp.getEntity());
                    return loc != null ? REDIRECT_PREFIX + loc.getValue() : null;
                }
                log.warn("CalDAV {} {} → HTTP {}", method, reqUrl, status);
                EntityUtils.consume(resp.getEntity());
                return null;
            });

            if (result == null) return null;
            if (!result.startsWith(REDIRECT_PREFIX)) return result;

            String location = result.substring(REDIRECT_PREFIX.length());
            currentUrl = location.startsWith("/")
                    ? URI.create(reqUrl).resolve(location).toString()
                    : location;
            log.info("CalDAV redirect → {}", currentUrl);
        }
        return null;
    }

    private String basicAuth() {
        String cred = username + ":" + password;
        return "Basic " + Base64.getEncoder().encodeToString(cred.getBytes(StandardCharsets.UTF_8));
    }

    // ── XML / URL ユーティリティ ──────────────────────

    Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    /**
     * {@code <response>} 直下（propstat 経由を含む）の最初の該当要素のテキスト。
     * getElementsByTagNameNS を親要素で呼ぶと入れ子の別 response まで拾うことがあるため、
     * 対象 response のサブツリー内で最初に見つかったものを使う。
     */
    static String firstChildText(Element parent, String ns, String localName) {
        NodeList nodes = parent.getElementsByTagNameNS(ns, localName);
        if (nodes.getLength() == 0) return null;
        Node node = nodes.item(0);
        String text = node.getTextContent();
        return text == null ? null : text.trim();
    }

    static String stripQuotes(String etag) {
        if (etag == null) return null;
        String v = etag.trim();
        if (v.startsWith("W/")) v = v.substring(2);
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
        return v.isBlank() ? null : v;
    }

    static String absolutize(String href) {
        if (href == null) return null;
        return href.startsWith("/") ? BASE_URL + href : href;
    }

    static String joinPath(String collectionUrl, String name) {
        return collectionUrl.endsWith("/") ? collectionUrl + name : collectionUrl + "/" + name;
    }

    static String escapeXml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String extractFirstHref(String xml, String parentLocalName) {
        try {
            Document doc = parseXml(xml);
            NodeList parents = doc.getElementsByTagName("*");
            for (int i = 0; i < parents.getLength(); i++) {
                Element el = (Element) parents.item(i);
                if (el.getLocalName() != null && el.getLocalName().equals(parentLocalName)) {
                    NodeList hrefs = el.getElementsByTagNameNS("DAV:", "href");
                    if (hrefs.getLength() > 0) {
                        return absolutize(hrefs.item(0).getTextContent().trim());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("XML parse error extracting {}: {}", parentLocalName, e.getMessage());
        }
        return null;
    }
}
