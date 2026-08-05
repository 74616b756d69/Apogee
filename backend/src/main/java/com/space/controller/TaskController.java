package com.space.controller;

import com.space.dto.TaskCreateDto;
import com.space.dto.TaskDto;
import com.space.dto.TaskUpdateDto;
import com.space.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * タスク (Apple リマインダー / CalDAV VTODO) REST API
 *
 * <pre>
 * GET    /api/tasks?filter=open   — タスク一覧
 * GET    /api/tasks/lists         — リマインダーリスト一覧（名前・色）
 * POST   /api/tasks               — 作成
 * PATCH  /api/tasks/{rawUid}      — 部分更新（完了トグル・時間ブロックを含む）
 * DELETE /api/tasks/{rawUid}      — 削除
 * </pre>
 *
 * filter は open（既定・未完了）/ today / overdue / upcoming / completed / all。
 */
@Slf4j
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    @GetMapping
    public List<TaskDto> listTasks(@RequestParam(required = false) String filter) {
        return taskService.listTasks(filter);
    }

    @GetMapping("/lists")
    public List<Map<String, String>> listTaskLists() {
        return taskService.listTaskLists();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskDto createTask(@RequestBody TaskCreateDto dto) {
        try {
            return taskService.createTask(dto);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            throw toResponseStatus(e, "タスクの作成に失敗しました");
        }
    }

    @PatchMapping("/{rawUid}")
    public TaskDto updateTask(@PathVariable String rawUid, @RequestBody TaskUpdateDto dto) {
        try {
            return taskService.updateTask(rawUid, dto);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (Exception e) {
            throw toResponseStatus(e, "タスクの更新に失敗しました");
        }
    }

    @DeleteMapping("/{rawUid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTask(@PathVariable String rawUid) {
        try {
            taskService.deleteTask(rawUid);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (Exception e) {
            throw toResponseStatus(e, "タスクの削除に失敗しました");
        }
    }

    /** CalendarController と同じ方針で、ETag 不一致は 409 にして再取得を促す。 */
    private static ResponseStatusException toResponseStatus(Exception e, String fallbackMessage) {
        if (e.getMessage() != null && e.getMessage().contains("CONFLICT")) {
            return new ResponseStatusException(HttpStatus.CONFLICT,
                    "他の端末で更新されています。再読み込みしてください");
        }
        log.warn("Task operation failed: {}", e.getMessage(), e);
        return new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, fallbackMessage);
    }
}
