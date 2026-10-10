package com.space.service;

/**
 * CalDAV から予定を取得できなかったことを表す。
 *
 * <p>「予定が 1 件も無い」と「取得に失敗した」は画面上まったく違う意味を持つ。
 * 失敗を空リストで返すと、認証切れやネットワーク障害が「空のカレンダー」として
 * 正常表示されてしまうため、取得できなかった場合はこの例外で呼び出し側に伝える。
 */
public class CalendarUnavailableException extends RuntimeException {

    public CalendarUnavailableException(String message) {
        super(message);
    }

    public CalendarUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
