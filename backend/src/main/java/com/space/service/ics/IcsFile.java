package com.space.service.ics;

import java.util.ArrayList;
import java.util.List;

/**
 * iCalendar (.ics) リソースを「行の集合」として扱う軽量エディタ。
 *
 * <p>ical4j でオブジェクトに読み込んでから再シリアライズすると、ライブラリが解釈できない
 * プロパティ（ATTENDEE の一部パラメータ、Apple 独自の X- 拡張など）が欠落する。
 * カレンダーは他クライアントと共有されるため、こちらが理解できない情報を落とすのは
 * 破壊的な更新になる。そこで書き込み系では、自分が管理する行だけを差し替え、
 * それ以外の行は一切触らずに素通しする。
 *
 * <p>入力は RFC 5545 の行折り返しを解除（unfold）した状態で保持し、出力時に再度折り返す。
 *
 * <p>切り出す対象のコンポーネントは {@link #parse(String, String)} で指定する。VEVENT
 * （カレンダー）と VTODO（リマインダー）で同じ編集戦略を使うため、名前だけを差し替える。
 */
public final class IcsFile {

    /** 既定で切り出すコンポーネント。 */
    public static final String VEVENT = "VEVENT";
    /** リマインダー（タスク）用コンポーネント。 */
    public static final String VTODO = "VTODO";

    private final String component;
    private final List<String> prologue = new ArrayList<>();
    private final List<VEventBlock> events = new ArrayList<>();
    private final List<String> epilogue = new ArrayList<>();

    private IcsFile(String component) {
        this.component = component;
    }

    /** このファイルが切り出しているコンポーネント名（"VEVENT" / "VTODO"）。 */
    public String component() {
        return component;
    }

    public List<VEventBlock> events() {
        return events;
    }

    /** RECURRENCE-ID を持たないマスター VEVENT。無ければ null。 */
    public VEventBlock master() {
        for (VEventBlock e : events) {
            if (e.propValue("RECURRENCE-ID") == null) return e;
        }
        return null;
    }

    /** 指定 RECURRENCE-ID の上書き VEVENT。無ければ null。 */
    public VEventBlock override(String recurrenceId) {
        if (recurrenceId == null) return null;
        for (VEventBlock e : events) {
            String v = e.propValue("RECURRENCE-ID");
            if (v != null && v.equals(recurrenceId)) return e;
        }
        return null;
    }

    public void addEvent(VEventBlock block) {
        events.add(block);
    }

    public void removeEvent(VEventBlock block) {
        events.remove(block);
    }

    /** VEVENT を切り出す。 */
    public static IcsFile parse(String raw) {
        return parse(raw, VEVENT);
    }

    /** 指定コンポーネント（VEVENT / VTODO）を切り出す。それ以外の行は前後にそのまま温存する。 */
    public static IcsFile parse(String raw, String component) {
        IcsFile file = new IcsFile(component);
        String begin = "BEGIN:" + component;
        String end = "END:" + component;
        List<String> lines = unfold(raw);

        List<String> current = null;
        boolean afterEvents = false;
        for (String line : lines) {
            if (line.equalsIgnoreCase(begin)) {
                current = new ArrayList<>();
                current.add(line);
                continue;
            }
            if (current != null) {
                current.add(line);
                if (line.equalsIgnoreCase(end)) {
                    file.events.add(new VEventBlock(current));
                    current = null;
                    afterEvents = true;
                }
                continue;
            }
            (afterEvents ? file.epilogue : file.prologue).add(line);
        }
        // BEGIN があって END が来ないまま終端した場合も落とさない
        if (current != null) {
            current.add(end);
            file.events.add(new VEventBlock(current));
        }
        return file;
    }

    public String render() {
        List<String> out = new ArrayList<>(prologue);
        for (VEventBlock e : events) out.addAll(e.lines());
        out.addAll(epilogue);

        StringBuilder sb = new StringBuilder();
        for (String line : out) {
            sb.append(fold(line)).append("\r\n");
        }
        return sb.toString();
    }

    // ── 行折り返し ────────────────────────────────────

    /**
     * RFC 5545 の折り返しを解除する。継続行は空白または水平タブで始まり、
     * その1文字を取り除いて直前の行に連結する。
     */
    static List<String> unfold(String raw) {
        List<String> result = new ArrayList<>();
        StringBuilder buf = null;
        for (String rawLine : raw.split("\r\n|\n|\r", -1)) {
            if (rawLine.isEmpty()) continue;
            char first = rawLine.charAt(0);
            if ((first == ' ' || first == '\t') && buf != null) {
                buf.append(rawLine, 1, rawLine.length());
            } else {
                if (buf != null) result.add(buf.toString());
                buf = new StringBuilder(rawLine);
            }
        }
        if (buf != null) result.add(buf.toString());
        return result;
    }

    /**
     * 75 オクテットで折り返す。マルチバイト文字の途中で切ると不正な UTF-8 になるため、
     * バイト数で数えつつコードポイント境界で分割する。
     */
    static String fold(String line) {
        final int limit = 73; // 継続行の先頭空白1バイト分の余裕を見る
        if (line.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 75) return line;

        StringBuilder out = new StringBuilder();
        int bytes = 0;
        for (int i = 0; i < line.length(); ) {
            int cp = line.codePointAt(i);
            int cpChars = Character.charCount(cp);
            int cpBytes = new String(Character.toChars(cp)).getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if (bytes + cpBytes > limit) {
                out.append("\r\n ");
                bytes = 1;
            }
            out.append(line, i, i + cpChars);
            bytes += cpBytes;
            i += cpChars;
        }
        return out.toString();
    }
}
