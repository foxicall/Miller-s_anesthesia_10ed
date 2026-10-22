# 米勒麻醉學臨床手冊 · Miller’s Anesthesia 10e

繁體中文（台灣）、行動優先的 VitePress PWA。87 個繁中章名與主題索引，分為九大臨床分類；提供中英本地搜尋、深色模式、浮動章節導覽與整站離線快取。

章節由使用者提供的 Google Drive PDF 轉為 Markdown，保留原始英文內容；介面使用繁體中文。下載與轉換流程見 [INGESTION.md](INGESTION.md)，各章頁數、圖片、雜湊及執行狀態見 `reports/ingestion-summary.json`。Gemini 繁中臨床摘要的金鑰設定、批次生成與續跑方式見 [SUMMARIES.md](SUMMARIES.md)；實際完成數以 `reports/chapter-summaries.json` 為準。尚未匯入的章節會明確標示，不會自行生成教材。這是獨立閱讀介面，非出版社官方產品。

## 檔案位置與下載

GitHub 儲存庫：[foxicall/Miller-s_anesthesia_10ed](https://github.com/foxicall/Miller-s_anesthesia_10ed)。可用 **Code → Download ZIP** 下載，或執行：

```bash
git clone https://github.com/foxicall/Miller-s_anesthesia_10ed.git
cd Miller-s_anesthesia_10ed
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 3000
```

| 檔案 | 儲存庫內位置 |
| --- | --- |
| 原文與圖片的匯入位置說明 | [output_md/README.md](output_md/README.md) |
| Gemini 摘要批次腳本 | [generate_chapter_summaries.py](generate_chapter_summaries.py) |
| 摘要設定、執行與續跑說明 | [SUMMARIES.md](SUMMARIES.md) |
| 87 章摘要進度及字數 | [reports/chapter-summaries.json](reports/chapter-summaries.json) |
| 網站介面與 PWA 設定 | [docs/](docs/)、[docs/.vitepress/config.mts](docs/.vitepress/config.mts) |
| 手機安裝步驟 | [docs/install.md](docs/install.md) |

此雲端工作區的專案位於 `/workspace/Miller-s_anesthesia_10ed/`；原始 PDF 位於 `/workspace/input_pdf/`。公開 GitHub 目前包含網站程式、摘要腳本與操作說明；87 章原文和圖片保留在雲端工作區的 `output_md/`。原始 PDF、套件、建置輸出、摘要與金鑰不納入本次公開上傳。`reports/` 是雲端工作區的處理紀錄，不表示 GitHub 包含教材全文。

下載程式後，未匯入章節時網站會顯示「內容待匯入」。將自己的 Markdown 與附件放入 `output_md/` 後，執行 `npm run build:complete` 可驗證及建置完整 87 章。摘要生成成功後會在雲端工作區新增 `summaries_md/Chapter_01.md` 至 `Chapter_87.md`；是否完成請以進度報告為準。

## 正式網站與手機安裝

- 網站：[米勒麻醉學](https://miller-anesthesia-10e-handbook.brainysky.chatgpt.site)
- 安裝教學：[手機安裝 App](https://miller-anesthesia-10e-handbook.brainysky.chatgpt.site/install.html)
- 目前為擁有者私人網站，首次請以網站擁有者的 ChatGPT 帳號登入。
- iPhone／iPad：Safari → 分享 → 加入主畫面；Android：Chrome → ⋮ → 安裝應用程式／加到主畫面。
- 從主畫面開啟後，保持連線直到「已可離線閱讀」。完整內容約 250 MiB，建議使用 Wi-Fi 並預留約 500 MiB。
- 開啟飛航模式並關閉 Wi-Fi 後，測試未讀章節、中英搜尋與圖表。

部署來源位於 `/workspace/sites/miller-anesthesia-10e`，使用 `.openai/hosting.json` 中的既有 Sites project ID；重新部署時沿用該 ID。此目錄是已建置的網站鏡像，應先從本專案重新建置，再同步並發布。部署紀錄見 `reports/sites-deployment.json`。

## 安裝與啟動

需要 **Node.js 22.12+**（建議 Node.js 22 LTS 或 24 LTS）與 npm。

```bash
npm install
npm run dev
```

開啟終端機顯示的網址（預設 `http://localhost:5173`）。`dev` 啟動時會自動匯入章節，修改、新增或刪除 `output_md/` 檔案會自動重新啟動開發伺服器並同步。開發模式停用 Service Worker，避免舊快取干擾開發。

```bash
npm run typecheck       # TypeScript 與 Vue 檢查
npm test                # 匯入、缺漏、附件與中文搜尋測試
npm run build           # 產生靜態網站與 Service Worker，驗證離線涵蓋率
npm run preview         # http://localhost:4173，測試正式版 PWA
npm run preview -- --host 0.0.0.0 --port 3000  # 指定介面與連接埠
```

正式網站檔案位於 `docs/.vitepress/dist/`。套件鎖定於 `package-lock.json`；CI 可使用 `npm ci`。

## 專案結構

```text
.
├── output_md/                         # 章節來源；支援子資料夾與本地附件
│   ├── Chapter_01.md … Chapter_87.md   # PDF 轉換的原文內容
│   └── assets/chapter-01/ …           # 各章圖例
├── docs/
│   ├── index.md                       # 自訂首頁
│   ├── guide.md                       # 繁體中文操作與安裝說明
│   ├── chapters/                      # 自動產生的 87 章與目錄（請勿手改）
│   ├── public/
│   │   ├── icons/                     # PNG、SVG、Apple touch、maskable 圖示
│   │   └── chapter-assets/            # 自動複製的章節附件
│   └── .vitepress/
│       ├── config.mts                 # VitePress、PWA、搜尋、路由與繁中設定
│       ├── generated/catalog.json     # 自動產生的章節資料
│       ├── theme/
│       │   ├── index.ts
│       │   ├── style.css
│       │   └── components/
│       │       ├── HomePage.vue
│       │       ├── ChapterDirectory.vue
│       │       ├── PwaStatus.vue
│       │       ├── ReadingTools.vue
│       │       ├── ChapterMeta.vue
│       │       └── AppIcon.vue
│       └── dist/                      # 正式建置輸出
├── scripts/
│   ├── prepare-content.ts             # 章號驗證、內容匯入、連結及附件處理
│   ├── chapter-localization.ts        # 87 組繁中章名、關鍵字與九大臨床分類
│   ├── optimize-images.ts             # 無損 WebP、逐像素驗證與內容雜湊快取
│   ├── compress-search.ts             # 完整搜尋索引壓縮與離線解壓縮
│   ├── ingest_drive_pdfs.py            # Drive 下載、PDF 結構化轉換與驗證
│   ├── rewrite-links.ts               # 只改寫 Markdown 連結，不碰程式碼範例
│   ├── search.ts                      # 中英混合斷詞
│   ├── generate-icons.ts              # 重建佔位 App 圖示
│   └── verify-build.ts                # 確認 87 頁、manifest 與所有資源皆被快取
├── tests/
├── reports/ingestion-summary.json      # 逐章轉換與網站建置結果
├── reports/chapter-summaries.json      # 逐章摘要狀態與字數
├── generate_chapter_summaries.py       # Gemini 逐章摘要、引用核對與續跑
├── requirements-ingest.txt             # Python 轉換依賴
├── requirements-summaries.txt          # Python 摘要依賴
├── INGESTION.md                        # 驗證、下載與轉換操作說明
├── SUMMARIES.md                        # Gemini 設定及摘要操作說明
├── playwright.config.ts               # 桌面與手機尺寸的離線瀏覽器測試
├── package.json
├── package-lock.json
├── tsconfig.json
└── .nvmrc
```

VitePress 的 Vite 設定集中在 `.vitepress/config.mts` 的 `vite` 區段，無須另外建立 `vite.config.ts`。

## 匯入 87 章

1. 將 Markdown 放入專案根目錄的 `output_md/`。可以使用 `01-導論.md`、`chapter_01.md`、`ch01.md`、`第1章.md`，或在 frontmatter 指定 `chapter`。
2. 每個章號必須唯一，範圍為 1–87。來源章名取自 frontmatter 的 `title` 或第一個 `#` 標題，保留於 `originalTitle`；網站標題使用 `scripts/chapter-localization.ts` 的繁中對照。
3. 使用 `##` 與 `###` 建立段落，大綱會自動產生。檔名及內文可使用繁體中文。
4. 圖片、PDF 等附件一併放在 `output_md/`，以 Markdown 相對路徑引用。章節間使用原始 `.md` 相對路徑；匯入器會轉為穩定路由。
5. 執行 `npm run build`。若要求所有章節均已匯入，使用 `npm run build:complete`，缺任何一章即失敗。

範例（僅示範格式，不包含教材內容）：

```markdown
---
chapter: 1
title: 你的章節標題
description: 本章的簡短說明
---

# 你的章節標題

## 段落標題

在此放入你的原始內容。

### 子段落

![圖說](images/figure-01.png)

[下一章](02-章節名稱.md)
```

- `output_md/README.md` 與隱藏檔會被忽略，其餘 `.md` 皆須能辨識章號。
- 檢查失敗時會列出原因：重複章號、空白內容、錯誤章號、斷裂本地連結或不支援的附件。
- 只匯入部分章節也能建置，其餘會保留明確的待匯入入口；不自行猜測原書章節名稱。
- 原始 Markdown 檔案不會被改寫；`docs/chapters/`、`generated/` 與 `chapter-assets/` 可重新產生。
- 圖片請使用 Markdown 語法。遠端圖片必須先存成本地附件，才能保證離線可用；外部一般連結維持原樣，需連網開啟。HTML 嵌入資源（img、iframe、script 等）會讓匯入失敗，請改用本地 Markdown 圖片／附件連結；自訂 Vue 元件的資源不在自動匯入支援範圍。
- 支援 PNG、JPEG、GIF、WebP、AVIF、SVG、ICO、PDF、WOFF/WOFF2、MP4、WebM、MP3、OGG、WAV。單一預快取檔案上限 50 MiB；大型內容需留意裝置容量與首次下載時間。
- `npm run content:sync` 可單獨同步。`npm run icons` 可從原始 SVG 重建所有佔位圖示。

## 搜尋與路由

- VitePress local search（MiniSearch）在建置時產生索引，搜尋完全在裝置執行。索引傳輸格式採 gzip 壓縮，搜尋時以 fflate 還原完整資料，不移除字詞或章節。
- 中文使用重疊雙字，例如「呼吸道管理」→「呼吸、吸道、道管、管理」；以 AND 組合減少只有部分字相同的結果。建議輸入兩個以上中文字。
- 英文、數字及 `mg/kg` 等單位採字詞索引，支援不分大小寫與前綴搜尋。
- 87 章皆在產生的頁面加入繁中章名與主題索引；例如「氣道管理」「呼吸道管理」可找到第 40 章，「丙泊酚」「propofol」可找到第 21 章。新增中文別名時修改 `scripts/chapter-localization.ts`，不必改動來源教材。
- 不自動翻譯整篇內文、繁簡或不同單位；中文主題搜尋指向章節索引，英文全文搜尋可定位原文段落。
- 章節穩定路由為 `/chapters/ch-01.html` 至 `/chapters/ch-87.html`，改變來源檔名不會改變網址。
- 側邊欄、首頁與目錄共用九大臨床分類；每章恰好歸入一類，前後章導覽保留原書數字順序。分類及繁中章名是本站整理，並非出版社官方中譯或原書分部。

## 離線快取與更新

使用 `@vite-pwa/vitepress` 整合 `vite-plugin-pwa`（Workbox `generateSW`）。Manifest 會產生在 `dist/manifest.webmanifest`：

```json
{
  "name": "米勒麻醉學 (Miller's Anesthesia 10e)",
  "short_name": "米勒麻醉學",
  "description": "Miller's Anesthesia 10th Edition 繁體中文臨床參考電子手冊",
  "lang": "zh-Hant-TW",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a"
}
```

實際 manifest 另含 `id`、`start_url`、`scope`、192×192、512×512 及 maskable 圖示。

- 預快取所有 HTML、章節非同步 JS、CSS、中文字詞搜尋索引、圖示、字型與本地附件；不是只快取曾開啟的章節。
- 不使用網頁 app shell fallback，避免把每個章節請求都回應為首頁。
- `npm run build` 最後會檢查每個發佈檔案是否列入 Service Worker；超過大小上限等造成的遺漏會讓建置失敗。
- 首次連線等待左下角「已可離線閱讀」，再關閉網路。首次下載未完成不能保證離線讀取。
- 圖庫會在建置時轉成較小的無損 WebP，並逐張比對解碼後的 RGBA 像素；比對不同或未縮小的圖檔保留原始 PNG。來源教材不變，轉換結果以內容雜湊快取。
- 圖片採延遲載入與非同步解碼；Service Worker 仍會將全部圖片與章節預先快取。首次使用建議連接 Wi-Fi，並預留約 500 MiB 以容納內容與更新快取。
- 新版本採提示更新，使用者按「立即更新」才重新載入，避免閱讀中途被強制切換。
- 快取完成狀態來自 Service Worker，重新開啟時也檢查章節快取；不以 localStorage 記錄猜測。
- 瀏覽器可能清除快取；安裝不是永久儲存保證。清除網站資料會移除離線內容。
- Dev 模式停用 Service Worker，請用 production build + preview 驗證 PWA。

## Preview、HTTPS 與手機測試

### 桌面正式版預覽

```bash
npm run build
npm run preview
```

1. 開啟 `http://localhost:4173`。瀏覽器將 localhost 視為安全來源，允許 Service Worker。
2. 在開發者工具 Application 檢查 Manifest、Service Workers 及 Cache Storage。
3. 等待「已可離線閱讀」。
4. 在 Network 勾選 Offline，重新載入，再直接開啟 `/chapters/ch-87.html` 等尚未瀏覽過的頁面。
5. 搜尋已匯入內容中的繁體中文詞彙。沒有內容時可搜尋操作說明中的「離線閱讀」。
6. 修改章節並重新建置／啟動 preview，重新連線並重開網站；在更新提示選擇「立即更新」，確認新內容。

### 手機可使用的 HTTPS 網址

手機開啟電腦的 `http://192.168.x.x:4173` 可檢查版面，**不符合 Service Worker 的安全來源要求**。請先將 `docs/.vitepress/dist/` 部署到支援 HTTPS 的靜態主機，或使用你信任的 HTTPS 開發通道轉送 preview 的 4173 埠。兩者擇一，手機再開啟該 HTTPS 網址。

靜態主機需正確提供 `.html` 與目錄的 `index.html`，不要將所有未知網址改寫為首頁。請用正式 HTTPS 網址測試實際安裝。

### iOS / iPadOS Safari：加入主畫面

1. 使用 Safari 開啟 HTTPS 網站，等待「已可離線閱讀」。
2. 點選「分享」→「加入主畫面」（部分系統需先開啟更多選單）。
3. 確認名稱「米勒麻醉學」，若出現「以網頁 App 開啟」請啟用，再點選「加入」。
4. 點主畫面的 App 圖示；確認以獨立視窗開啟，沒有一般 Safari 網址列。
5. 在這個獨立視窗保持連線直到離線狀態就緒；iOS 各版本的 Safari/App 儲存行為可能不同。
6. 開啟飛航模式並確認 Wi-Fi 已關閉；重開 App、讀取未瀏覽章節並搜尋。

### Android Chrome：安裝應用程式

1. 使用 Chrome 開啟 HTTPS 網站，等待「已可離線閱讀」。
2. 點網站的「安裝手冊」，或 Chrome「⋮」→「安裝應用程式／加到主畫面」。
3. 按「安裝」並從主畫面開啟。
4. 確認獨立視窗與 App 圖示，切換深色模式，檢查手機大綱及返回頂端按鈕。
5. 開啟飛航模式且關閉 Wi-Fi，重開 App，驗證未讀章節、中文搜尋及本地圖片。

### 部署到子路徑

例如網站位於 `https://example.com/miller/`：

```bash
BASE_PATH=/miller/ npm run build
BASE_PATH=/miller/ npm run preview
```

PowerShell：先執行 `$env:BASE_PATH='/miller/'`，再執行相同 npm 指令。BASE_PATH 必須以 `/` 開頭及結尾；同時套用至網站資源、manifest 與 Service Worker 範圍。

## 發佈前檢查

- 使用 `npm run build:complete` 確認 87 章皆已匯入；檢查圖表、表格、醫學名詞與劑量單位是否忠於提供的來源。
- `npm run typecheck`、`npm test`、`npm run build` 均應通過。
- 在實際 iPhone/iPad 及 Android 完成上述安裝與飛航模式測試；桌面模擬不能取代真機驗證。
- 如部署後停留在舊版，可檢查更新提示；測試環境需要重置時，在開發者工具解除 Service Worker 並清除網站快取，再重新載入。

### 自動化瀏覽器測試

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

測試會自動啟動 preview，以桌面與 Pixel 7 尺寸確認無水平溢出、全站快取就緒、斷網重新載入、未讀章節直達、首次離線中文搜尋、章節篩選與手機大綱。若使用系統 Chromium，可指定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`。截圖位於 `test-results/`，不納入版本控制。
