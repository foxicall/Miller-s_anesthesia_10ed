# Google Drive PDF → Markdown

腳本：`scripts/ingest_drive_pdfs.py`。使用 Google Drive 唯讀 API 下載章節，以 PyMuPDF／pymupdf4llm 進行版面分析，保留來源英文、標題、表格、圖例、上下標與單位；不翻譯、不生成或推論醫療內容。

## 本次執行結果（2026-10-22）

- 來源資料夾：`Miller's Anesthesia 10ed`（ID：`1ENJd3mWOfnRXO4fvnVmqYEJOtYjWebXr`）。排除合訂本與目錄，下載 87 份章節 PDF，共 378,401,372 bytes。
- 環境只有 Drive API key，直接 API 請求回覆 HTTP 401。因此本次透過已連線 Google Drive 的 OAuth 授權下載，再執行 Python 的 `--local-only --manifest /workspace/input_pdf/.drive-manifest.json --workers 2 --build`；沒有將 connector 憑證複製到環境。
- 完成 `Chapter_01.md`–`Chapter_87.md`，共 3,249 頁、2,231 個圖檔；其中 584 張為表格或缺字符號的原始頁面影像。
- 22 章、50 頁有無法辨識的字元，已在對應位置標示並附原頁影像；頁碼清單位於 `reports/ingestion-summary.json` 的 `needs_review`。
- 所有章節、frontmatter、圖片連結及 `npm run build:complete` 驗證通過。網站輸出約 499 MiB，首次完整離線快取需要相應儲存空間與下載時間。
- Chromium 實測完整快取後斷網：`propofol` 搜尋有結果、未開啟過的第 87 章可讀取及重新整理、第 21 章原頁影像可顯示；390 px 手機寬度無橫向溢出、無 JavaScript 錯誤。這不等同於實體 iOS／Android 安裝測試。

環境有有效的 service account／OAuth 憑證時，可直接使用下方的完整下載命令。

## 安裝

需要 Python 3.10+。建議使用獨立虛擬環境：

```bash
cd /workspace/Miller-s_anesthesia_10ed
python -m venv /workspace/.venv-miller-ingest
/workspace/.venv-miller-ingest/bin/python -m pip install -r requirements-ingest.txt
```

`PySocks` 支援 `google-api-python-client` 使用環境中的 HTTPS proxy；腳本保留既有 proxy 與 CA 憑證設定。

## Google 驗證

使用環境設定或祕密管理系統提供下列其中一種方式；勿將金鑰提交到 Git：

- `GOOGLE_APPLICATION_CREDENTIALS_JSON`：service account 或 authorized-user JSON。
- `GOOGLE_SERVICE_ACCOUNT_JSON`：service account JSON 別名。
- `GOOGLE_APPLICATION_CREDENTIALS`：service account／Application Default Credentials JSON 檔案路徑。
- `GOOGLE_OAUTH_TOKEN_JSON`：含 `type: authorized_user`、client ID、client secret、refresh token 的授權 JSON。
- `GOOGLE_ACCESS_TOKEN`：既有、尚未過期且可讀取來源資料夾的 OAuth access token。
- 已設定的 Application Default Credentials。

Service account 必須已獲授權讀取來源資料夾。API key（`GDRIVE_API_KEY` 或 `GOOGLE_API_KEY`）只識別專案，不等於私人 Drive 的使用者授權。腳本可以使用它存取允許的公開內容，但若回應 401／403，請提供 OAuth／service account 授權，或使用下方的已下載檔案模式。

## 下載、轉換並建置

```bash
/workspace/.venv-miller-ingest/bin/python scripts/ingest_drive_pdfs.py \
  --folder-name "Miller's Anesthesia 10ed" \
  --workers 2 \
  --build
```

若已有資料夾 ID，可使用 `--folder-id ID` 或環境變數 `GOOGLE_DRIVE_FOLDER_ID`。遇到多個同名資料夾時會停止，避免下載錯誤來源。支援分頁與 shared drives。

預設位置：

- PDF：`/workspace/input_pdf/`，保留來源檔名。
- Markdown：`/workspace/Miller-s_anesthesia_10ed/output_md/Chapter_01.md` 至 `Chapter_87.md`。
- 圖片：`output_md/assets/chapter-01/` 至 `chapter-87/`。
- 結果報告：`reports/ingestion-summary.json`，包含來源雜湊、頁數、圖片數、表格列數與建置狀態。

章號以數字解析，支援 `1. Name.pdf`、`15, Name.pdf`、`Chapter_01.pdf`。會排除沒有章號的合訂本與目錄；重複、缺章或超出 1–87 皆會報錯。進度列分別顯示下載、PDF 檢查與轉換。

## 使用已下載的章節

可由已連線的 Google Drive 授權下載 PDF，再交給同一套 Python 流程。這種情況不會把 connector 的 OAuth 憑證複製到 Python 環境。

```bash
/workspace/.venv-miller-ingest/bin/python scripts/ingest_drive_pdfs.py \
  --local-only \
  --manifest /workspace/input_pdf/.drive-manifest.json \
  --workers 2 \
  --build
```

`--manifest` 可省略；提供時可額外依 Drive 中的檔案大小與可用的 MD5 校驗。Manifest 格式：

```json
{
  "folder_id": "Drive folder ID",
  "download_method": "connected_google_drive_oauth",
  "files": [
    {"chapter": 1, "id": "Drive file ID", "name": "1. Title.pdf", "size": "123456"}
  ]
}
```

實際 manifest 必須列出所有 87 章。

## 轉換與驗證行為

1. 確認 87 個 PDF 皆存在、非空白、可開啟、未加密，且大小／可用校驗碼符合來源。
2. 從 PDF 書籤取得章名，其次用 PDF metadata，再其次使用檔名。
3. 在獨立暫存目錄平行轉換。每個 process 各自開啟 PDF，避免共用不安全的 PyMuPDF 文件物件。
4. 使用版面模型清除頁首頁尾；額外清理反覆出現的短頁邊文字。原頁碼以 `<!-- PDF page N -->` 留在 Markdown，方便核對。
5. 保留表格、圖片、粗斜體、`<sup>`／`<sub>`；不重新計算、改寫或統一醫療數值與單位。含表格或無法辨識符號的頁面，另附可展開的原頁影像；後者也會標示「符號需核對」並列入報告的 `needs_review`。
6. 驗證 87 個精確檔名、frontmatter、非空白內文與圖片路徑。
7. 全部驗證成功才替換輸出目錄；既有目錄會保留為 `output_md.backup-*`。失敗時保留原輸出及暫存資料，位置記錄於報告。
8. `--build` 會執行 `npm run build:complete`，確認網站匯入全部章節並建立 PWA。建置失敗不會刪除已完成的 Markdown。

PDF 版面轉換無法保證每個複雜表格、公式與閱讀順序皆正確。報告提供頁數、表格列數、文字過少頁面與替代字元數，供核對；需要影像 OCR 的文件會停止，不會以空白內容假裝成功。臨床使用前須對照來源 PDF 檢查。

## 測試與常用參數

```bash
/workspace/.venv-miller-ingest/bin/python -m unittest discover -s tests -p 'test_ingest_pdfs.py' -v
```

- `--download-only`：只下載與驗證 PDF。
- `--resume`：從前一次報告的暫存目錄或已完成輸出續跑；重用前會核對 PDF 與 Markdown 的 SHA-256。
- `--pdf-dir PATH`／`--output-dir PATH`：覆寫位置。
- `--workers 1`：降低記憶體使用；預設 2，最大 8。
- `--report PATH`：另存執行報告。
