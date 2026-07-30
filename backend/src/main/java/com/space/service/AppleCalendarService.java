package com.space.service;

import com.space.dto.CalendarEventCreateDto;
import com.space.dto.CalendarEventDto;
import com.space.dto.CalendarEventUpdateDto;
import lombok.extern.slf4j.Slf4j;
import net.fortuna.ical4j.data.CalendarBuilder;
import net.fortuna.ical4j.model.Calendar;
import net.fortuna.ical4j.model.Component;
import net.fortuna.ical4j.model.DateTime;
import net.fortuna.ical4j.model.Period;
import net.fortuna.ical4j.model.PeriodList;
import net.fortuna.ical4j.model.component.VEvent;
import net.fortuna.ical4j.model.property.DtStart;
import net.fortuna.ical4j.model.property.Summary;
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
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Service
public class AppleCalendarService {

    private static final String BASE_URL   = "https://caldav.icloud.com";
    private static final ZoneId JST        = ZoneId.of("Asia/Tokyo");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    @Value("${apple.calendar.username:}")
    private String username;

    @Value("${apple.calendar.password:}")
    private String password;

    private record CollectionInfo(String url, String displayName, String color) {}

    private static final long COLLECTIONS_TTL_MS = 30 * 60 * 1000;
    private volatile List<CollectionInfo> cachedCollections;
    private volatile long collectionsCachedAt = 0L;

    private static final long EVENTS_TTL_MS = 5 * 60 * 1000;
    private record CachedEvents(List<CalendarEventDto> events, long cachedAt) {}
    private final Map<LocalDate, CachedEvents> eventsCache = new ConcurrentHashMap<>();

    private static final long MONTH_EVENTS_TTL_MS = 5 * 60 * 1000;
    private record CachedMonthEvents(Map<String, List<CalendarEventDto>> events, long cachedAt) {}
    private final Map<YearMonth, CachedMonthEvents> monthEventsCache = new ConcurrentHashMap<>();

    private final ExecutorService caldavExecutor = Executors.newFixedThreadPool(8, r -> {
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
                .setMaxConnTotal(20)
                .setMaxConnPerRoute(10)
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

    public List<CalendarEventDto> getTodayEvents() {
        return getEventsForDate(LocalDate.now(JST));
    }

    public List<CalendarEventDto> getEventsForDate(LocalDate date) {
        if (username.isBlank() || password.isBlank()) {
            log.info("Apple Calendar credentials not configured — skipping CalDAV fetch.");
            return Collections.emptyList();
        }

        CachedEvents cached = eventsCache.get(date);
        if (cached != null && (System.currentTimeMillis() - cached.cachedAt()) < EVENTS_TTL_MS) {
            return cached.events();
        }

        try {
            List<CollectionInfo> collections = getCachedCollections();
            if (collections.isEmpty()) return List.of();

            Map<String, CalendarEventDto> eventMap = new ConcurrentHashMap<>();
            List<CompletableFuture<Void>> futures = collections.stream()
                .map(info -> CompletableFuture.runAsync(() -> {
                    try {
                        for (CalendarEventDto e : queryDay(info, date)) {
                            String dedup = e.getUid() + "@" + e.getDate();
                            eventMap.putIfAbsent(dedup, e);
                        }
                    } catch (Exception ex) {
                        log.warn("CalDAV query failed for collection {}: {}", info.url(), ex.getMessage());
                    }
                }, caldavExecutor))
                .toList();
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            List<CalendarEventDto> events = new ArrayList<>(eventMap.values());
            events.sort(Comparator.comparing(e -> e.getStartTime() == null ? "" : e.getStartTime()));
            eventsCache.put(date, new CachedEvents(events, System.currentTimeMillis()));
            return events;

        } catch (Exception e) {
            log.error("Apple Calendar fetch failed: {}", e.getMessage());
            throw new RuntimeException("Apple Calendar fetch failed: " + e.getMessage(), e);
        }
    }

    public Map<String, List<CalendarEventDto>> getEventsForMonth(int year, int month) {
        if (username.isBlank() || password.isBlank()) return Map.of();

        YearMonth ym = YearMonth.of(year, month);

        CachedMonthEvents cached = monthEventsCache.get(ym);
        if (cached != null && (System.currentTimeMillis() - cached.cachedAt()) < MONTH_EVENTS_TTL_MS) {
            return cached.events();
        }

        try {
            List<CollectionInfo> collections = getCachedCollections();
            if (collections.isEmpty()) return Map.of();

            LocalDate from = ym.atDay(1);
            LocalDate to = ym.plusMonths(1).atDay(1);

            Map<String, CalendarEventDto> allEvents = new ConcurrentHashMap<>();
            List<CompletableFuture<Void>> futures = collections.stream()
                .map(info -> CompletableFuture.runAsync(() -> {
                    try {
                        for (CalendarEventDto e : queryRange(info, from, to)) {
                            String dedup = e.getUid() + "@" + e.getDate();
                            allEvents.putIfAbsent(dedup, e);
                        }
                    } catch (Exception ex) {
                        log.warn("CalDAV month query failed for {}: {}", info.url(), ex.getMessage());
                    }
                }, caldavExecutor))
                .toList();
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            Map<String, List<CalendarEventDto>> result = new HashMap<>();
            long now = System.currentTimeMillis();
            for (CalendarEventDto event : allEvents.values()) {
                if (event.getDate() == null) continue;
                result.computeIfAbsent(event.getDate(), k -> new ArrayList<>()).add(event);
            }
            for (Map.Entry<String, List<CalendarEventDto>> entry : result.entrySet()) {
                entry.getValue().sort(Comparator.comparing(e -> e.getStartTime() == null ? "" : e.getStartTime()));
                LocalDate date = LocalDate.parse(entry.getKey());
                eventsCache.put(date, new CachedEvents(List.copyOf(entry.getValue()), now));
            }

            Map<String, List<CalendarEventDto>> immutableResult = Map.copyOf(result);
            monthEventsCache.put(ym, new CachedMonthEvents(immutableResult, now));
            return immutableResult;

        } catch (Exception e) {
            log.error("Apple Calendar month fetch failed: {}", e.getMessage());
            return Map.of();
        }
    }

    public List<Map<String, String>> getCollections() {
        if (username.isBlank() || password.isBlank()) return List.of();
        try {
            return getCachedCollections().stream()
                    .map(c -> Map.of(
                            "name", c.displayName(),
                            "color", c.color() != null ? c.color() : "#4a9eff"))
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to fetch collections: {}", e.getMessage());
            return List.of();
        }
    }

    public void createEvent(CalendarEventCreateDto dto) throws Exception {
        if (username.isBlank() || password.isBlank()) {
            throw new Exception("Apple Calendar credentials not configured");
        }

        LocalDate date   = LocalDate.parse(dto.getDate());
        boolean   allDay = dto.getStartTime() == null || dto.getStartTime().isBlank();

        String uid      = UUID.randomUUID().toString();
        String dtstamp  = ZonedDateTime.now(ZoneId.of("UTC"))
                .format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));

        StringBuilder ics = new StringBuilder();
        ics.append("BEGIN:VCALENDAR\r\n")
           .append("VERSION:2.0\r\n")
           .append("PRODID:-//SpaceApp//EN\r\n")
           .append("BEGIN:VEVENT\r\n")
           .append("UID:").append(uid).append("\r\n")
           .append("DTSTAMP:").append(dtstamp).append("\r\n");

        if (allDay) {
            String d   = date.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            String end = date.plusDays(1).format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            ics.append("DTSTART;VALUE=DATE:").append(d).append("\r\n")
               .append("DTEND;VALUE=DATE:").append(end).append("\r\n");
        } else {
            DateTimeFormatter icalFmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
            LocalTime start = LocalTime.parse(dto.getStartTime());
            LocalTime end   = (dto.getEndTime() != null && !dto.getEndTime().isBlank())
                    ? LocalTime.parse(dto.getEndTime())
                    : start.plusHours(1);
            ics.append("DTSTART;TZID=Asia/Tokyo:")
               .append(ZonedDateTime.of(date, start, JST).format(icalFmt)).append("\r\n")
               .append("DTEND;TZID=Asia/Tokyo:")
               .append(ZonedDateTime.of(date, end, JST).format(icalFmt)).append("\r\n");
        }

        ics.append("SUMMARY:").append(dto.getTitle()).append("\r\n")
           .append("END:VEVENT\r\n")
           .append("END:VCALENDAR\r\n");

        List<CollectionInfo> collections = getCachedCollections();
        if (collections.isEmpty()) throw new Exception("No calendar collections found");

        String targetName = dto.getCalendarName();
        CollectionInfo target = collections.get(0);
        if (targetName != null && !targetName.isBlank()) {
            target = collections.stream()
                    .filter(c -> c.displayName().equals(targetName))
                    .findFirst()
                    .orElse(target);
        }
        String col = target.url();
        if (!col.endsWith("/")) col += "/";
        String eventUrl = col + uid + ".ics";

        HttpUriRequestBase req = new HttpUriRequestBase("PUT", URI.create(eventUrl));
        req.setHeader("Authorization", basicAuth());
        req.setHeader("Content-Type", "text/calendar; charset=utf-8");
        req.setEntity(new StringEntity(ics.toString(),
                ContentType.create("text/calendar", StandardCharsets.UTF_8)));

        sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            EntityUtils.consume(resp.getEntity());
            if (status < 200 || status >= 300) {
                throw new RuntimeException("CalDAV PUT failed: " + status);
            }
            return null;
        });

        eventsCache.remove(date);
        monthEventsCache.remove(YearMonth.from(date));
    }

    public void updateEvent(String rawUid, CalendarEventUpdateDto dto) throws Exception {
        if (username.isBlank() || password.isBlank()) {
            throw new Exception("Apple Calendar credentials not configured");
        }

        LocalDate date = LocalDate.parse(dto.getDate());
        boolean allDay = dto.getStartTime() == null || dto.getStartTime().isBlank();

        String dtstamp = ZonedDateTime.now(ZoneId.of("UTC"))
                .format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));

        StringBuilder ics = new StringBuilder();
        ics.append("BEGIN:VCALENDAR\r\n")
           .append("VERSION:2.0\r\n")
           .append("PRODID:-//SpaceApp//EN\r\n")
           .append("BEGIN:VEVENT\r\n")
           .append("UID:").append(rawUid).append("\r\n")
           .append("DTSTAMP:").append(dtstamp).append("\r\n");

        if (allDay) {
            String d   = date.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            String end = date.plusDays(1).format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            ics.append("DTSTART;VALUE=DATE:").append(d).append("\r\n")
               .append("DTEND;VALUE=DATE:").append(end).append("\r\n");
        } else {
            DateTimeFormatter icalFmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
            LocalTime start = LocalTime.parse(dto.getStartTime());
            LocalTime end   = (dto.getEndTime() != null && !dto.getEndTime().isBlank())
                    ? LocalTime.parse(dto.getEndTime())
                    : start.plusHours(1);
            ics.append("DTSTART;TZID=Asia/Tokyo:")
               .append(ZonedDateTime.of(date, start, JST).format(icalFmt)).append("\r\n")
               .append("DTEND;TZID=Asia/Tokyo:")
               .append(ZonedDateTime.of(date, end, JST).format(icalFmt)).append("\r\n");
        }

        ics.append("SUMMARY:").append(dto.getTitle()).append("\r\n")
           .append("END:VEVENT\r\n")
           .append("END:VCALENDAR\r\n");

        String eventUrl = resolveEventUrl(rawUid, dto.getCalendarName());

        HttpUriRequestBase req = new HttpUriRequestBase("PUT", URI.create(eventUrl));
        req.setHeader("Authorization", basicAuth());
        req.setHeader("Content-Type", "text/calendar; charset=utf-8");
        req.setEntity(new StringEntity(ics.toString(),
                ContentType.create("text/calendar", StandardCharsets.UTF_8)));

        sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            EntityUtils.consume(resp.getEntity());
            if (status < 200 || status >= 300) {
                throw new RuntimeException("CalDAV PUT (update) failed: " + status);
            }
            return null;
        });

        clearCachesForDate(date);
    }

    public void deleteEvent(String rawUid, String calendarName) throws Exception {
        if (username.isBlank() || password.isBlank()) {
            throw new Exception("Apple Calendar credentials not configured");
        }

        String eventUrl = resolveEventUrl(rawUid, calendarName);

        HttpUriRequestBase req = new HttpUriRequestBase("DELETE", URI.create(eventUrl));
        req.setHeader("Authorization", basicAuth());

        sharedHttpClient.execute(req, resp -> {
            int status = resp.getCode();
            EntityUtils.consume(resp.getEntity());
            if (status < 200 || status >= 300) {
                throw new RuntimeException("CalDAV DELETE failed: " + status);
            }
            return null;
        });

        eventsCache.clear();
        monthEventsCache.clear();
    }

    private String resolveEventUrl(String rawUid, String calendarName) throws Exception {
        List<CollectionInfo> collections = getCachedCollections();
        if (collections.isEmpty()) throw new Exception("No calendar collections found");

        CollectionInfo target = collections.get(0);
        if (calendarName != null && !calendarName.isBlank()) {
            target = collections.stream()
                    .filter(c -> c.displayName().equals(calendarName))
                    .findFirst()
                    .orElse(target);
        }
        String col = target.url();
        if (!col.endsWith("/")) col += "/";
        return col + rawUid + ".ics";
    }

    private void clearCachesForDate(LocalDate date) {
        eventsCache.remove(date);
        monthEventsCache.remove(YearMonth.from(date));
    }

    // ── コレクション探索（キャッシュ付き） ───────────────

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

    // ── CalDAV リクエスト ────────────────────────────

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
            String href = hrefNodes.item(0).getTextContent().trim();
            if (href.startsWith("/")) href = BASE_URL + href;

            String displayName = "";
            NodeList nameNodes = resp.getElementsByTagNameNS("DAV:", "displayname");
            if (nameNodes.getLength() > 0) displayName = nameNodes.item(0).getTextContent().trim();

            String color = null;
            NodeList colorNodes = resp.getElementsByTagNameNS("http://apple.com/ns/ical/", "calendar-color");
            if (colorNodes.getLength() > 0) {
                String raw = colorNodes.item(0).getTextContent().trim();
                if (raw.startsWith("#") && raw.length() == 9) {
                    color = raw.substring(0, 7);
                } else if (raw.startsWith("#") && raw.length() == 7) {
                    color = raw;
                }
            }

            infos.add(new CollectionInfo(href, displayName, color));
        }
        return infos;
    }

    private List<CalendarEventDto> queryDay(CollectionInfo info, LocalDate today) throws Exception {
        DateTimeFormatter utcFmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
        String start = today.atStartOfDay(JST).withZoneSameInstant(ZoneId.of("UTC")).format(utcFmt);
        String end   = today.plusDays(1).atStartOfDay(JST).withZoneSameInstant(ZoneId.of("UTC")).format(utcFmt);

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
                java.util.Date.from(today.atStartOfDay(JST).toInstant()));
        net.fortuna.ical4j.model.Date rangeEnd = new DateTime(
                java.util.Date.from(today.plusDays(1).atStartOfDay(JST).toInstant()));

        List<CalendarEventDto> events = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList dataNodes = doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar-data");
        for (int i = 0; i < dataNodes.getLength(); i++) {
            String icsData = dataNodes.item(i).getTextContent();
            events.addAll(parseIcsForRange(icsData, info.displayName(), info.color(), rangeStart, rangeEnd));
        }
        return events;
    }

    private List<CalendarEventDto> queryRange(CollectionInfo info,
                                               LocalDate from, LocalDate to) throws Exception {
        DateTimeFormatter utcFmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
        String start = from.atStartOfDay(JST).withZoneSameInstant(ZoneId.of("UTC")).format(utcFmt);
        String end   = to.atStartOfDay(JST).withZoneSameInstant(ZoneId.of("UTC")).format(utcFmt);

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
                java.util.Date.from(to.atStartOfDay(JST).toInstant()));

        List<CalendarEventDto> events = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList dataNodes = doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar-data");
        for (int i = 0; i < dataNodes.getLength(); i++) {
            String icsData = dataNodes.item(i).getTextContent();
            events.addAll(parseIcsForRange(icsData, info.displayName(), info.color(), rangeStart, rangeEnd));
        }
        return events;
    }

    // ── iCalendar パース ─────────────────────────────

    List<CalendarEventDto> parseIcsForRange(String icsData, String calendarName,
                                                      String calendarColor,
                                                      net.fortuna.ical4j.model.Date rangeStart,
                                                      net.fortuna.ical4j.model.Date rangeEnd) {
        List<CalendarEventDto> result = new ArrayList<>();
        try {
            CalendarBuilder builder = new CalendarBuilder();
            Calendar cal = builder.build(new StringReader(icsData));
            for (Component comp : cal.getComponents(Component.VEVENT)) {
                VEvent event = (VEvent) comp;
                DtStart dtStart = event.getStartDate();
                if (dtStart == null) continue;

                Uid uidProp = event.getUid();
                String uid = uidProp != null ? uidProp.getValue() : UUID.randomUUID().toString();

                Summary summaryProp = event.getSummary();
                String title = summaryProp != null ? summaryProp.getValue() : "（タイトルなし）";

                boolean allDay = !(dtStart.getDate() instanceof DateTime);

                PeriodList periods = event.getConsumedTime(rangeStart, rangeEnd);
                LocalDate qStart = rangeStart.toInstant().atZone(JST).toLocalDate();
                LocalDate qEnd   = rangeEnd.toInstant().atZone(JST).toLocalDate();

                for (Object obj : periods) {
                    Period period = (Period) obj;
                    ZonedDateTime pStart = allDay
                            ? period.getStart().toInstant().atZone(ZoneId.of("UTC"))
                            : period.getStart().toInstant().atZone(JST);
                    ZonedDateTime pEnd = allDay
                            ? period.getEnd().toInstant().atZone(ZoneId.of("UTC"))
                            : period.getEnd().toInstant().atZone(JST);

                    LocalDate startDate = pStart.toLocalDate();
                    LocalDate endDate   = pEnd.toLocalDate();
                    if (!allDay && pEnd.toLocalTime().equals(java.time.LocalTime.MIDNIGHT)) {
                        endDate = endDate.minusDays(1);
                    }

                    if (startDate.equals(endDate)) {
                        String dateKey = startDate.toString();
                        String startTime = allDay ? null : pStart.format(TIME_FMT);
                        result.add(new CalendarEventDto(uid + "_" + dateKey, uid, title, startTime, null,
                                allDay, calendarName, calendarColor, dateKey));
                    } else {
                        for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
                            if (d.isBefore(qStart) || !d.isBefore(qEnd)) continue;
                            String dateKey = d.toString();
                            result.add(new CalendarEventDto(uid + "_" + dateKey, uid, title, null, null,
                                    true, calendarName, calendarColor, dateKey));
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("iCalendar parse error (range): {}", e.getMessage());
        }
        return result;
    }

    // ── ユーティリティ ────────────────────────────────

    private static final String REDIRECT_PREFIX = "REDIRECT:";

    private String sendWebDav(String method, String url, String body, String depth) throws Exception {
        String currentUrl = url;
        for (int hop = 0; hop < 6; hop++) {
            final String reqUrl = currentUrl;
            HttpUriRequestBase req = new HttpUriRequestBase(method, URI.create(reqUrl));
            req.setHeader("Authorization", basicAuth());
            req.setHeader("Depth", depth);
            req.setHeader("Content-Type", "application/xml; charset=utf-8");
            if (body != null) {
                req.setEntity(new StringEntity(body, ContentType.APPLICATION_XML));
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

    private Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
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
                        String href = hrefs.item(0).getTextContent().trim();
                        if (href.startsWith("/")) href = BASE_URL + href;
                        return href;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("XML parse error extracting {}: {}", parentLocalName, e.getMessage());
        }
        return null;
    }
}
