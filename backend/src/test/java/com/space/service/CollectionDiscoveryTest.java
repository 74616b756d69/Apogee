package com.space.service;

import com.space.service.AppleCalendarService.CollectionInfo;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * calendar-home の PROPFIND 応答から、カレンダー (VEVENT) とリマインダーリスト (VTODO) を
 * 取り違えないことを確認する。ここを間違えると、リマインダーリストがカレンダー選択欄に出て、
 * そこにイベントを作ろうとした瞬間に iCloud が 403 を返す。
 */
class CollectionDiscoveryTest {

    private final AppleCalendarService service = new AppleCalendarService();

    /** iCloud の実際の応答を模したマルチステータス。 */
    private static final String PROPFIND_RESPONSE = """
        <?xml version="1.0" encoding="UTF-8"?>
        <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"
                     xmlns:ical="http://apple.com/ns/ical/">
          <response>
            <href>/123456/calendars/</href>
            <propstat>
              <prop><resourcetype><collection/></resourcetype></prop>
              <status>HTTP/1.1 200 OK</status>
            </propstat>
          </response>
          <response>
            <href>/123456/calendars/work/</href>
            <propstat>
              <prop>
                <resourcetype><collection/><C:calendar/></resourcetype>
                <displayname>大学</displayname>
                <ical:calendar-color>#FF2D55FF</ical:calendar-color>
                <C:supported-calendar-component-set>
                  <C:comp name="VEVENT"/>
                </C:supported-calendar-component-set>
              </prop>
              <status>HTTP/1.1 200 OK</status>
            </propstat>
          </response>
          <response>
            <href>/123456/calendars/tasks/</href>
            <propstat>
              <prop>
                <resourcetype><collection/><C:calendar/></resourcetype>
                <displayname>リマインダー</displayname>
                <ical:calendar-color>#1BADF8FF</ical:calendar-color>
                <C:supported-calendar-component-set>
                  <C:comp name="VTODO"/>
                </C:supported-calendar-component-set>
              </prop>
              <status>HTTP/1.1 200 OK</status>
            </propstat>
          </response>
        </multistatus>
        """;

    @Test
    void separatesCalendarsFromReminderLists() throws Exception {
        List<CollectionInfo> infos = service.parseCollections(PROPFIND_RESPONSE);

        assertEquals(2, infos.size(), "コレクションでない calendar-home 自体は含めない");

        CollectionInfo calendar = infos.stream()
                .filter(c -> c.displayName().equals("大学")).findFirst().orElseThrow();
        assertTrue(calendar.supports("VEVENT"));
        assertFalse(calendar.supports("VTODO"), "カレンダーをタスク側に出さない");
        assertEquals("#FF2D55", calendar.color(), "末尾のアルファは落とす");

        CollectionInfo reminders = infos.stream()
                .filter(c -> c.displayName().equals("リマインダー")).findFirst().orElseThrow();
        assertTrue(reminders.supports("VTODO"));
        assertFalse(reminders.supports("VEVENT"),
                "リマインダーリストをカレンダー選択欄に出すと、イベント作成が iCloud に 403 で拒否される");
    }

    @Test
    void treatsMissingComponentSetAsCalendar() throws Exception {
        String xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
              <response>
                <href>/123456/calendars/legacy/</href>
                <propstat>
                  <prop>
                    <resourcetype><collection/><C:calendar/></resourcetype>
                    <displayname>旧サーバ</displayname>
                  </prop>
                  <status>HTTP/1.1 200 OK</status>
                </propstat>
              </response>
            </multistatus>
            """;

        List<CollectionInfo> infos = service.parseCollections(xml);

        assertEquals(1, infos.size());
        assertTrue(infos.get(0).supports("VEVENT"),
                "プロパティを返さないサーバでは従来どおりカレンダーとして扱う");
    }

    @Test
    void keepsCollectionsSupportingBothComponents() throws Exception {
        String xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
              <response>
                <href>/123456/calendars/mixed/</href>
                <propstat>
                  <prop>
                    <resourcetype><collection/><C:calendar/></resourcetype>
                    <displayname>兼用</displayname>
                    <C:supported-calendar-component-set>
                      <C:comp name="VEVENT"/>
                      <C:comp name="VTODO"/>
                    </C:supported-calendar-component-set>
                  </prop>
                  <status>HTTP/1.1 200 OK</status>
                </propstat>
              </response>
            </multistatus>
            """;

        List<CollectionInfo> infos = service.parseCollections(xml);

        assertEquals(1, infos.size());
        assertTrue(infos.get(0).supports("VEVENT"));
        assertTrue(infos.get(0).supports("VTODO"), "両対応のコレクションは双方に出す");
    }
}
