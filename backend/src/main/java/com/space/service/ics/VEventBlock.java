package com.space.service.ics;

import java.util.ArrayList;
import java.util.List;

/**
 * .ics 内の 1 つの VEVENT。BEGIN:VEVENT / END:VEVENT を含む行の並びをそのまま保持する。
 *
 * <p>プロパティの読み書きは「VEVENT 直下の行」だけを対象にし、VALARM など入れ子の
 * コンポーネント内の行は別扱いにする。DTSTART は VEVENT にも VALARM 内の TRIGGER 周辺にも
 * 現れうるため、この区別をしないと誤った行を書き換えてしまう。
 */
public final class VEventBlock {

    private final List<String> lines;

    public VEventBlock(List<String> lines) {
        this.lines = new ArrayList<>(lines);
    }

    public List<String> lines() {
        return lines;
    }

    public VEventBlock copy() {
        return new VEventBlock(lines);
    }

    // ── 読み取り ──────────────────────────────────────

    /** VEVENT 直下の指定プロパティの値部分（":" 以降）。無ければ null。 */
    public String propValue(String name) {
        String line = propLine(name);
        if (line == null) return null;
        int colon = valueColonIndex(line);
        return colon < 0 ? "" : line.substring(colon + 1);
    }

    /** VEVENT 直下の指定プロパティの行全体（パラメータ込み）。無ければ null。 */
    public String propLine(String name) {
        for (int i : topLevelIndices()) {
            if (nameOf(lines.get(i)).equalsIgnoreCase(name)) return lines.get(i);
        }
        return null;
    }

    /** 指定プロパティ行のパラメータ値。例: paramValue("DTSTART", "TZID")。 */
    public String paramValue(String name, String param) {
        String line = propLine(name);
        if (line == null) return null;
        int colon = valueColonIndex(line);
        String head = colon < 0 ? line : line.substring(0, colon);
        for (String part : splitParams(head)) {
            int eq = part.indexOf('=');
            if (eq > 0 && part.substring(0, eq).equalsIgnoreCase(param)) {
                String v = part.substring(eq + 1);
                if (v.startsWith("\"") && v.endsWith("\"") && v.length() >= 2) v = v.substring(1, v.length() - 1);
                return v;
            }
        }
        return null;
    }

    // ── 書き込み ──────────────────────────────────────

    /** VEVENT 直下の指定プロパティを全て削除する。 */
    public void removeProp(String name) {
        List<Integer> targets = new ArrayList<>();
        for (int i : topLevelIndices()) {
            if (nameOf(lines.get(i)).equalsIgnoreCase(name)) targets.add(i);
        }
        for (int i = targets.size() - 1; i >= 0; i--) {
            lines.remove((int) targets.get(i));
        }
    }

    /** 指定プロパティを削除してから 1 行追加する。値が null なら削除のみ。 */
    public void setProp(String name, String fullLine) {
        removeProp(name);
        if (fullLine != null) lines.add(lines.size() - 1, fullLine);
    }

    /** 削除せずに 1 行追加する（EXDATE のように複数行許容されるもの用）。 */
    public void addLine(String fullLine) {
        lines.add(lines.size() - 1, fullLine);
    }

    /** 入れ子の VALARM を全て取り除く。 */
    public void removeAlarms() {
        List<String> out = new ArrayList<>();
        int depth = 0;
        for (String line : lines) {
            if (line.equalsIgnoreCase("BEGIN:VALARM")) { depth++; continue; }
            if (line.equalsIgnoreCase("END:VALARM")) { if (depth > 0) depth--; continue; }
            if (depth == 0) out.add(line);
        }
        lines.clear();
        lines.addAll(out);
    }

    /** END:VEVENT の直前に行群を挿入する。 */
    public void addBlockBeforeEnd(List<String> block) {
        lines.addAll(lines.size() - 1, block);
    }

    // ── 内部 ─────────────────────────────────────────

    /** VALARM など入れ子コンポーネントの外側にある行のインデックス（BEGIN/END:VEVENT 自体は除く）。 */
    private List<Integer> topLevelIndices() {
        List<Integer> result = new ArrayList<>();
        int depth = 0;
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String upper = line.toUpperCase();
            if (upper.startsWith("BEGIN:")) {
                if (i != 0) depth++;
                continue;
            }
            if (upper.startsWith("END:")) {
                if (depth > 0) depth--;
                continue;
            }
            if (depth == 0) result.add(i);
        }
        return result;
    }

    private static String nameOf(String line) {
        int end = line.length();
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == ';' || c == ':') { end = i; break; }
        }
        return line.substring(0, end);
    }

    /**
     * 値の開始を示す ":" の位置。パラメータ値が引用符で囲まれている場合、
     * その中の ":" は区切りではないので読み飛ばす。
     */
    private static int valueColonIndex(String line) {
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') inQuotes = !inQuotes;
            else if (c == ':' && !inQuotes) return i;
        }
        return -1;
    }

    /** "DTSTART;TZID=Asia/Tokyo;VALUE=DATE-TIME" → ["TZID=Asia/Tokyo", "VALUE=DATE-TIME"] */
    private static List<String> splitParams(String head) {
        List<String> result = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder buf = new StringBuilder();
        boolean skippedName = false;
        for (int i = 0; i < head.length(); i++) {
            char c = head.charAt(i);
            if (c == '"') { inQuotes = !inQuotes; buf.append(c); continue; }
            if (c == ';' && !inQuotes) {
                if (skippedName) result.add(buf.toString());
                skippedName = true;
                buf.setLength(0);
                continue;
            }
            buf.append(c);
        }
        if (skippedName && buf.length() > 0) result.add(buf.toString());
        return result;
    }
}
