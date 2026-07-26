package com.space.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * ロケット打ち上げ情報エンティティ
 * upcoming=true  : 打ち上げ予定
 * upcoming=false : 過去の打ち上げ
 */
@Data
@Entity
@Table(name = "launches")
public class Launch {

    /** Space Launch Now API が返す UUID */
    @Id
    private String id;

    /** 打ち上げ名称 (例: "Falcon 9 | Starlink Group 6-53") */
    @Column(length = 255)
    private String name;

    /** ステータス名称 (例: "Go for Launch", "TBD") */
    @Column(name = "status_name", length = 100)
    private String statusName;

    /** 打ち上げ予定日時 (ISO 8601 文字列, 例: "2024-12-25T10:00:00Z") */
    @Column(name = "net", length = 50)
    private String net;

    /** ロケット名称 (例: "Falcon 9") */
    @Column(name = "rocket_name", length = 255)
    private String rocketName;

    /** ミッション名称 */
    @Column(name = "mission_name", length = 255)
    private String missionName;

    /** ミッション詳細説明 */
    @Column(name = "mission_description", columnDefinition = "TEXT")
    private String missionDescription;

    /** ミッション種別 (例: "Communications", "Earth Science") */
    @Column(name = "mission_type", length = 100)
    private String missionType;

    /** 打ち上げ施設名称 */
    @Column(name = "pad_name", length = 255)
    private String padName;

    /** 打ち上げ場所名称 (例: "Cape Canaveral, FL, USA") */
    @Column(name = "location_name", length = 255)
    private String locationName;

    /** 打ち上げ施設の緯度 */
    @Column(name = "pad_latitude")
    private Double padLatitude;

    /** 打ち上げ施設の経度 */
    @Column(name = "pad_longitude")
    private Double padLongitude;

    /** 打ち上げ画像 URL */
    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;

    /** true=予定, false=過去 */
    @Column(name = "is_upcoming")
    private boolean upcoming;

    /** DB 更新日時 */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
