package com.space.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

/**
 * Spaceflight News API v4 のレスポンスを受け取る DTO
 * エンドポイント: /v4/articles/?launch={id}
 *
 * 外部 API はスネークケース (image_url 等) を返すため @JsonAlias で読み替える。
 * フィールド名自体はキャメルケースにし、そのままフロントエンドへの
 * レスポンス JSON にも使う（他の DTO と同じ命名規則に揃える）。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SpaceflightNewsResponse {

    private int count;

    private List<ArticleDto> results;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ArticleDto {

        private Long id;

        private String title;

        private String url;

        @JsonAlias("image_url")
        private String imageUrl;

        @JsonAlias("news_site")
        private String newsSite;

        private String summary;

        @JsonAlias("published_at")
        private String publishedAt;
    }
}
