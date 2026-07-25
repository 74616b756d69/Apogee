package com.space.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * Space Launch Now API のレスポンスを受け取る DTO
 * エンドポイント: /launch/upcoming/ および /launch/previous/
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class LaunchApiResponse {

    @JsonProperty("count")
    private int count;

    @JsonProperty("next")
    private String next;

    @JsonProperty("results")
    private List<LaunchResult> results;

    // =========================================================
    // 打ち上げ1件分
    // =========================================================
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LaunchResult {

        @JsonProperty("id")
        private String id;

        @JsonProperty("name")
        private String name;

        /** ステータス情報 */
        @JsonProperty("status")
        private StatusDto status;

        /** 打ち上げ予定日時 (ISO 8601, null の場合あり) */
        @JsonProperty("net")
        private String net;

        /** ロケット情報 */
        @JsonProperty("rocket")
        private RocketDto rocket;

        /** ミッション情報 (null の場合あり) */
        @JsonProperty("mission")
        private MissionDto mission;

        /** 打ち上げ施設情報 (null の場合あり) */
        @JsonProperty("pad")
        private PadDto pad;

        /** 打ち上げ画像 URL (null の場合あり) */
        @JsonProperty("image")
        private String image;
    }

    // =========================================================
    // ネスト DTO 群
    // =========================================================

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StatusDto {
        @JsonProperty("name")
        private String name;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RocketDto {
        @JsonProperty("configuration")
        private ConfigurationDto configuration;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ConfigurationDto {
        @JsonProperty("name")
        private String name;

        @JsonProperty("full_name")
        private String fullName;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class MissionDto {
        @JsonProperty("name")
        private String name;

        @JsonProperty("description")
        private String description;

        @JsonProperty("type")
        private String type;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PadDto {
        @JsonProperty("name")
        private String name;

        @JsonProperty("location")
        private LocationDto location;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LocationDto {
        @JsonProperty("name")
        private String name;
    }
}
