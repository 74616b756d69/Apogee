package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * カレンダーイベント1オカレンス。
 *
 * <p>座標系は2種類を併存させている:
 * <ul>
 *   <li><b>start / end</b> — FullCalendar がそのまま解釈できる正規表現。
 *       終日は "YYYY-MM-DD"（end は排他的＝翌日）、時間指定は ISO-8601 オフセット付き。
 *       複数日にまたがるイベントも1件のまま保持する。</li>
 *   <li><b>date / endDate / startTime / endTime</b> — 旧 API 互換の日付キー表現。
 *       月/週マップ系エンドポイントと TodayView が依存している。</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CalendarEventDto {

    /** 表示用の一意キー。繰り返しの各回を区別するため uid + 開始日時で構成する。 */
    private String uid;

    /** CalDAV 上の生 UID（更新・削除に使用）。繰り返しでも全回で同一。 */
    private String rawUid;

    private String title;

    /** 開始。終日なら "YYYY-MM-DD"、時間指定なら "YYYY-MM-DDTHH:mm:ss+09:00"。 */
    private String start;

    /** 終了（排他的）。終日なら翌日の "YYYY-MM-DD"。 */
    private String end;

    private boolean allDay;

    private String calendarName;

    /** "#RRGGBB" */
    private String calendarColor;

    /** イベント個別の色分けタグ。未指定ならカレンダー色にフォールバックする。 */
    private String tagColor;

    private String location;
    private String url;
    private String notes;

    /** RFC 5545 の RRULE 本体（"FREQ=WEEKLY;BYDAY=MO,WE,FR" 形式。RRULE: 接頭辞は含まない）。 */
    private String rrule;

    /** このイベントが繰り返しの一部か。 */
    private boolean recurring;

    /**
     * 繰り返しの当該回を指す RECURRENCE-ID 相当値。
     * マスターの RRULE 展開から生成された回は「その回の本来の開始日時」が入る。
     * 単発イベントでは null。編集スコープ this / thisAndFuture の基準になる。
     */
    private String recurrenceId;

    /** この回が RECURRENCE-ID 付き VEVENT（個別に上書き済みの回）であれば true。 */
    private boolean overridden;

    /** 通知設定（開始の何分前か。負値は開始後）。 */
    private List<Integer> reminders;

    /** 楽観ロック用 ETag。更新時に If-Match として送り返す。 */
    private String etag;

    // ── 旧 API 互換フィールド ────────────────────────────

    /** "YYYY-MM-DD"（開始日） */
    private String date;

    /** "YYYY-MM-DD"（終了日・包含）。単日なら date と同じ。 */
    private String endDate;

    /** "HH:mm"、終日なら null */
    private String startTime;

    /** "HH:mm"、終日なら null */
    private String endTime;
}
