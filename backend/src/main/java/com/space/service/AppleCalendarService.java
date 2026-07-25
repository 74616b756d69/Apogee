package com.space.service;

import com.space.dto.CalendarEventDto;
import lombok.extern.slf4j.Slf4j;
import net.fortuna.ical4j.data.CalendarBuilder;
import net.fortuna.ical4j.model.Calendar;
import net.fortuna.ical4j.model.Component;
import net.fortuna.ical4j.model.DateTime;
import net.fortuna.ical4j.model.component.VEvent;
import net.fortuna.ical4j.model.property.DtStart;
import net.fortuna.ical4j.model.property.Summary;
import net.fortuna.ical4j.model.property.Uid;
import org.apache.hc.client5.http.classic.methods.HttpUriRequestBase;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.StringEntity;
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
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

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

    // principal URL / calendar home / コレクション一覧はアカウント設定が変わらない限り不変なのでキャッシュする
    private static final long COLLECTIONS_TTL_MS = 30 * 60 * 1000; // 30分
    private volatile List<String> cachedCollections;
    private volatile long collectionsCachedAt = 0L;

    public List<CalendarEventDto> getTodayEvents() {
        return getEventsForDate(LocalDate.now(JST));
    }

    public List<CalendarEventDto> getEventsForDate(LocalDate date) {
        if (username.isBlank() || password.isBlank()) {
            log.info("Apple Calendar credentials not configured — skipping CalDAV fetch.");
            return Collections.emptyList();
        }
        try (CloseableHttpClient client = buildHttpClient()) {
            List<String> collections = getCachedCollections(client);
            if (collections.isEmpty()) return List.of();

            // UID をキーに重複排除（複数コレクションに同一イベントが存在する場合がある）
            Map<String, CalendarEventDto> eventMap = new LinkedHashMap<>();
            for (String col : collections) {
                for (CalendarEventDto e : queryToday(client, col, date)) {
                    eventMap.putIfAbsent(e.getUid(), e);
                }
            }
            List<CalendarEventDto> events = new ArrayList<>(eventMap.values());
            events.sort(Comparator.comparing(e -> e.getStartTime() == null ? "" : e.getStartTime()));
            return events;

        } catch (Exception e) {
            log.error("Apple Calendar fetch failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ── コレクション探索（キャッシュ付き） ───────────────

    private synchronized List<String> getCachedCollections(CloseableHttpClient client) throws Exception {
        long now = System.currentTimeMillis();
        if (cachedCollections != null && (now - collectionsCachedAt) < COLLECTIONS_TTL_MS) {
            return cachedCollections;
        }
        List<String> collections = discoverCollections(client);
        if (collections.isEmpty() && cachedCollections != null) {
            // 探索に失敗した場合は古いキャッシュを使い続ける（一時的なネットワーク不調対策）
            return cachedCollections;
        }
        cachedCollections = collections;
        collectionsCachedAt = now;
        return collections;
    }

    private List<String> discoverCollections(CloseableHttpClient client) throws Exception {
        String principalUrl = discoverPrincipal(client);
        if (principalUrl == null) return List.of();

        String calHome = getCalendarHome(client, principalUrl);
        if (calHome == null) return List.of();

        return listCollections(client, calHome);
    }

    // ── CalDAV リクエスト ────────────────────────────

    private String discoverPrincipal(CloseableHttpClient client) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:">
              <d:prop><d:current-user-principal/></d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav(client, "PROPFIND", BASE_URL + "/.well-known/caldav", body, "0");
        return xml != null ? extractFirstHref(xml, "current-user-principal") : null;
    }

    private String getCalendarHome(CloseableHttpClient client, String principalUrl) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop><c:calendar-home-set/></d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav(client, "PROPFIND", principalUrl, body, "0");
        return xml != null ? extractFirstHref(xml, "calendar-home-set") : null;
    }

    private List<String> listCollections(CloseableHttpClient client, String calHome) throws Exception {
        String body = """
            <?xml version="1.0" encoding="utf-8"?>
            <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:resourcetype/>
                <d:displayname/>
              </d:prop>
            </d:propfind>
            """;
        String xml = sendWebDav(client, "PROPFIND", calHome, body, "1");
        if (xml == null) return List.of();

        List<String> hrefs = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList responses = doc.getElementsByTagNameNS("DAV:", "response");
        for (int i = 0; i < responses.getLength(); i++) {
            Element resp = (Element) responses.item(i);
            // calendar リソースタイプを持つコレクションだけを対象にする
            NodeList calType = resp.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar");
            if (calType.getLength() > 0) {
                NodeList hrefNodes = resp.getElementsByTagNameNS("DAV:", "href");
                if (hrefNodes.getLength() > 0) {
                    String href = hrefNodes.item(0).getTextContent().trim();
                    // BASE_URL が含まれていない場合は補完
                    if (href.startsWith("/")) href = "https://caldav.icloud.com" + href;
                    hrefs.add(href);
                }
            }
        }
        return hrefs;
    }

    private List<CalendarEventDto> queryToday(CloseableHttpClient client, String collectionUrl, LocalDate today) throws Exception {
        String start = today.atStartOfDay(ZoneId.of("UTC")).format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));
        String end   = today.plusDays(1).atStartOfDay(ZoneId.of("UTC")).format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));

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

        String xml = sendWebDav(client, "REPORT", collectionUrl, body, "1");
        if (xml == null) return List.of();

        // calendar-data 要素からiCalendarデータを抽出してパース
        List<CalendarEventDto> events = new ArrayList<>();
        Document doc = parseXml(xml);
        NodeList dataNodes = doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar-data");
        for (int i = 0; i < dataNodes.getLength(); i++) {
            String icsData = dataNodes.item(i).getTextContent();
            events.addAll(parseIcs(icsData, today));
        }
        return events;
    }

    // ── iCalendar パース ─────────────────────────────

    private List<CalendarEventDto> parseIcs(String icsData, LocalDate today) {
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

                // ical4j 3.x: DateTime extends Date — all-day events use bare Date
                boolean allDay = !(dtStart.getDate() instanceof DateTime);

                String startTime = null;
                if (!allDay) {
                    ZonedDateTime zdt = dtStart.getDate().toInstant().atZone(JST);
                    startTime = zdt.format(TIME_FMT);
                }

                result.add(new CalendarEventDto(uid, title, startTime, null, allDay));
            }
        } catch (Exception e) {
            log.warn("iCalendar parse error: {}", e.getMessage());
        }
        return result;
    }

    // ── ユーティリティ ────────────────────────────────

    private CloseableHttpClient buildHttpClient() {
        return HttpClients.custom()
            .disableRedirectHandling()
            .build();
    }

    private static final String REDIRECT_PREFIX = "REDIRECT:";

    private String sendWebDav(CloseableHttpClient client, String method,
                               String url, String body, String depth) throws Exception {
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
            String result = client.execute(req, resp -> {
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
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private String extractFirstHref(String xml, String parentLocalName) {
        try {
            Document doc = parseXml(xml);
            // 対象の親要素を探す（任意のネームスペース）
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
