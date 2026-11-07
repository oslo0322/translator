# 露營區營位管理

純 HTML / CSS / JavaScript 前端，保留 GitHub Pages 既有網址及 `main` 根目錄發布設定；所有變更位於 `camp-map/`。

## 地圖及編輯

- 地圖聚焦使用者紅框：`viewBox="-8 112 818 408"`。大道、停車場、楓樹區、飛流區與瀑布已移除。
- 營位位置不變。1–13 為 40 × 70 SVG 單位，14–16 為 70 × 40，統一每公尺 10 單位，皆為 28 平方公尺。
- 小屋區、軍事區、第一至第四客廳區皆可點選。一行一個名字，每區最多 10 人，每個名字最多 40 字。地圖顯示前 5 名及剩餘數量；下方卡片列出完整名單。
- 營位單名過長分行並省略尾端，點選可查看完整姓名。標號始終與姓名分開。
- 編輯 dialog 獨立於地圖縮放。支援鍵盤、觸控、滾輪、拖曳、雙指及按鈕縮放。

## 共用儲存

- API：`https://camp-map-oslo0322.oslo0322.chatgpt.site/api/entries`
- Sites Worker + Cloudflare D1，無登入；依使用者選擇，任何知道網址的人均可查看、修改及清空共用名單。
- 停止輸入 550 ms 後自動儲存；按「完成」會等待儲存確認。開著頁面每 5 秒同步，亦可手動同步。
- 每個位置各有 revision。儲存需符合讀取時的 revision；同時改同一位置會提示衝突並保留未儲存草稿，可重新載入或放棄草稿。不同位置可獨立修改。
- CSV 匯入、清空等多位置操作使用單一 SQL 敘述，版本全部符合才整批更新，避免部分成功。
- 離線不會宣稱儲存成功，也不會在恢復網路時自動覆蓋共用資料。
- 舊的 `camp-map.names.v1` localStorage 不刪除；若有內容會提供明確確認的匯入按鈕，不會默默上傳舊名單。
- `storage` adapter 集中處理資料讀寫，未來可更換 provider。

## CSV

UTF-8（匯出含 BOM），保留兩欄 `營位編號,姓名`。數字 1–16 為營位；`cabin`、`military`、`lounge1`–`lounge4` 為新增區域。區域多人姓名以引號包住的換行欄位保存；支援逗號與雙引號。可匯入舊版純數字 CSV；檔案內指定位置會覆蓋，未列出的不變。匯入前先完整驗證，再確認更新共用資料。

## 後端來源與部署

`shared/` 保留後端來源、Sites 身分及資料庫 migration，沒有密鑰。正式資料存於 D1，不在 GitHub。

- `shared/worker/index.js`：GET/PUT/OPTIONS API、輸入驗證、CORS 與樂觀鎖。
- `shared/.openai/hosting.json`：Sites 專案與 `DB` 綁定。
- `shared/drizzle/0000_entries.sql`：schema-only migration。已套用 migration 不可修改；新增變更應追加。
- `node shared/build.mjs`：產生被 Git 忽略的 `shared/dist/`。

前端部署與後端部署分開：前端推送此 Repository 的 `main` 觸發 Pages；後端更新需發布到 manifest 中同一個 Sites 專案，保留資料庫。請勿把 `shared/` 當成其他獨立應用程式的部署設定覆蓋根目錄 Pages。
