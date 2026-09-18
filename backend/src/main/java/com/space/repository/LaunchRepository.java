package com.space.repository;

import com.space.model.Launch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface LaunchRepository extends JpaRepository<Launch, String> {

    List<Launch> findByUpcomingFalseOrderByNetDesc();

    /**
     * 打ち上げ予定のうち、まだ時刻が来ていないものだけ。
     *
     * <p>API の upcoming フィードから外れた行は誰も upcoming=false に落とさないため、
     * 打ち上げ済みのロケットが「予定」に残り続ける。net 昇順で並べるとそれが先頭に来て、
     * カウントダウンが消えた状態で表示されてしまう。下の demoteFinishedLaunches が
     * 定期的に掃除するが、次の同期までの隙間もここで塞いでおく。
     */
    @Query("SELECT l FROM Launch l WHERE l.upcoming = true "
         + "AND SUBSTRING(l.net, 1, 19) >= SUBSTRING(:now, 1, 19) ORDER BY l.net ASC")
    List<Launch> findUpcomingFrom(@Param("now") String now);

    /**
     * 時刻を過ぎた「予定」を過去の打ち上げに移す。外部 API を叩かずに実行できる。
     * 行は消さない（過去の打ち上げ一覧で表示するため）。
     */
    @Modifying
    @Transactional
    @Query("UPDATE Launch l SET l.upcoming = false WHERE l.upcoming = true "
         + "AND SUBSTRING(l.net, 1, 19) < SUBSTRING(:now, 1, 19)")
    int demoteFinishedLaunches(@Param("now") String now);

    /**
     * 2ヶ月以上前の過去打ち上げを削除。
     * net は文字列カラムのため、API のフォーマット差異（ミリ秒有無など）に影響されないよう
     * 日付部分（先頭10文字 = yyyy-MM-dd）だけを取り出して比較する。
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM Launch l WHERE l.upcoming = false AND SUBSTRING(l.net, 1, 10) < SUBSTRING(:cutoff, 1, 10)")
    void deleteOldPreviousLaunches(@Param("cutoff") String cutoff);
}
