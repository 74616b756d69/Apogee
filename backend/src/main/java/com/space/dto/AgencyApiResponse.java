package com.space.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * Space Launch Now API のレスポンスを受け取る DTO
 * エンドポイント: /agencies/
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AgencyApiResponse {

    @JsonProperty("count")
    private int count;

    @JsonProperty("next")
    private String next;

    @JsonProperty("results")
    private List<AgencyResult> results;

    // =========================================================
    // 宇宙機関1件分
    // =========================================================
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AgencyResult {

        @JsonProperty("id")
        private Integer id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("abbrev")
        private String abbrev;

        /** 種別: "Government", "Commercial", "Multinational" など */
        @JsonProperty("type")
        private String type;

        @JsonProperty("country_code")
        private String countryCode;

        @JsonProperty("description")
        private String description;

        @JsonProperty("image_url")
        private String imageUrl;

        @JsonProperty("logo_url")
        private String logoUrl;
    }
}
