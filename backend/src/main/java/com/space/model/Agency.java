package com.space.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 宇宙機関エンティティ (NASA, JAXA, SpaceX など)
 */
@Data
@Entity
@Table(name = "agencies")
public class Agency {

    /** Space Launch Now API が返す数値 ID */
    @Id
    private Integer id;

    /** 機関の正式名称 (例: "National Aeronautics and Space Administration") */
    @Column(length = 255)
    private String name;

    /** 略称 (例: "NASA") */
    @Column(length = 50)
    private String abbrev;

    /** 種別 (例: "Government", "Commercial", "Multinational") */
    @Column(length = 100)
    private String type;

    /** ISO 国コード (例: "USA", "JPN") */
    @Column(name = "country_code", length = 20)
    private String countryCode;

    /** 機関の説明文 */
    @Column(columnDefinition = "TEXT")
    private String description;

    /** 画像 URL */
    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;

    /** ロゴ URL */
    @Column(name = "logo_url", columnDefinition = "TEXT")
    private String logoUrl;

    /** DB 更新日時 */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
