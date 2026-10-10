package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * イベントの作成・更新ペイロード。
 *
 * <p>日時は {@link CalendarEventDto} と同じ正規表現を使う:
 * 終日は "YYYY-MM-DD"（end は排他的＝翌日）、時間指定は ISO-8601。
 *
 * <p>null のフィールドは「変更なし」ではなく「未設定」を意味する。更新時に既存 VEVENT の
 * 未知プロパティ（ATTENDEE / X- 独自拡張など）は保持されるが、ここで表現できる項目は
 * null を送ればクリアされる。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CalendarEventWriteDto {

    private String title;

    /** 開始。終日 "YYYY-MM-DD" / 時間指定 ISO-8601。 */
    private String start;

    /** 終了（排他的）。省略時は終日=開始翌日、時間指定=開始+1時間。 */
    private String end;

    private boolean allDay;

    private String calendarName;

    private String location;
    private String url;
    private String notes;

    /** 色分けタグ "#RRGGBB"。 */
    private String tagColor;

    /** RRULE 本体（"FREQ=WEEKLY;BYDAY=MO,WE,FR"）。null で繰り返し解除。 */
    private String rrule;

    /** 通知（開始の何分前か）。 */
    private List<Integer> reminders;

    /**
     * 繰り返しイベント編集時の適用範囲。
     * "this" / "thisAndFuture" / "all"。省略時は "all"（＝単発イベントと同じ扱い）。
     */
    private String editScope;

    /**
     * editScope が this / thisAndFuture のときの対象回。
     * {@link CalendarEventDto#getRecurrenceId()} をそのまま送り返す。
     */
    private String recurrenceId;

    /** 楽観ロック用。取得時の ETag を送ると If-Match 付きで PUT する。 */
    private String etag;
}
