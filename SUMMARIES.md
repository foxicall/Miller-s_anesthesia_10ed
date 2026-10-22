# Gemini 繁中臨床摘要

`generate_chapter_summaries.py` 依序處理 `output_md/Chapter_01.md` 到 `Chapter_87.md`，另存到 `summaries_md/`。原文檔案不會被覆寫。每份摘要最後保留完整英文內文；網站會自動優先讀取通過檢查的摘要，保留原有章節網址、圖片、搜尋與離線快取。

## 設定金鑰

在執行環境的 **Secrets** 新增 `GEMINI_API_KEY`，允許目的網域 **generativelanguage.googleapis.com**，套用至目前環境。不要貼在聊天、寫入程式或提交至 Git。也支援 `GOOGLE_API_KEY`、`GOOGLE_GEMINI_API_KEY`；不會使用 Google Drive 金鑰。

預設模型為 `gemini-2.5-flash`；可透過非機密環境變數 `GEMINI_MODEL` 或 `--model` 指定其他支援 JSON schema 的 Gemini 模型。腳本會先確認模型能力與 context 大小。模型的 API 配額與計費由該金鑰所屬 Google 專案決定。

## 安裝與執行

```bash
cd /workspace/Miller-s_anesthesia_10ed
python3 -m venv .venv-summaries
.venv-summaries/bin/python -m pip install -r requirements-summaries.txt
npm install

# 不需金鑰：確認 87 章、繁中標題與 PDF 頁碼
.venv-summaries/bin/python generate_chapter_summaries.py --preflight

# 依序生成，87 章全部通過後自動重建網站
.venv-summaries/bin/python generate_chapter_summaries.py --rebuild

# 隨時檢查目前進度，列出所有 87 章字詞數
.venv-summaries/bin/python generate_chapter_summaries.py --validate-only

npm run preview -- --host 0.0.0.0 --port 3000
```

目前雲端工作區也可使用已安裝依賴的 `/workspace/.venv-miller-ingest/bin/python` 直接執行。

## 摘要結構與來源

每章均有核心觀念、臨床指引與處置決策（術前／監測與劑量／介入步驟）、併發症與危機處理、高頻考點，以及英文原文。繁中章名沿用本網站 87 章對照表。

將全部可擷取文字依原始 PDF 頁碼送給 Gemini，保留表格與 Key Points；不會只取開頭，也不會靜默截斷超長章節。圖片留在原文供人工查閱，這個文字流程不會將無法辨讀的圖片劑量當作已知內容。若超過模型 context，該章失敗並保留其他已完成章節，改用較大 context 模型後重跑。

每個實質主張都必須有逐字英文引文及頁碼。程式會核對引用、數值及固定段落結構，再由 Gemini 做第二輪語意、族群、給藥途徑及單位檢查。不適用的基礎或研究章節可明示「本章未提供」，不補造處置流程。來源含缺字的章節另有提示。這些是自動檢查，不能視為臨床專家審閱或醫療指引認證。

網站摘要中的頁碼可跳到下方英文原文。`summaries_md/` 是合併內容的中間來源，圖片路徑相對於原始 `output_md/`；由網站匯入器統一解析。原文段落在摘要檔中逐字保留，網站僅調整重複大標題並加入跳轉錨點。

## 續跑、限流與驗證

- 每章通過後，以原子寫入保存 Markdown 與 `.summary-checkpoints/Chapter_NN.json`。重新執行相同指令會跳過已完成且來源、模型、提示、程式版本及輸出雜湊均相符的章節。
- `.summary-checkpoints/` 包含引用與自動檢查紀錄，請隨工作區保留；不需對外發布。修改原文、模型或程式會讓相關檢查點失效，需重新生成。網站對過期或遭修改的摘要會阻止建置，避免混用版本。
- 每次請求預設間隔 5 秒。429／暫時性伺服器及連線失敗最多重試 6 次，遵守 `Retry-After` 並使用退避與隨機延遲。可用 `--delay 10 --retries 8` 調整。每章驗證不通過預設最多重新生成 2 次。
- Ctrl-C 後再執行原指令即可續跑；同一專案只允許一個批次程序。
- `reports/chapter-summaries.json` 每章完成即更新；表格區分成功、待處理及失敗，不會將空白或假摘要計為完成。
- 「字詞數」為摘要中文字 + 英文單字與數值詞，不含原文、標題及頁碼；另列純中文字數。
- 結束碼：`0` 全部成功（或前置檢查成功），`1` 摘要／建置未全部完成，`2` 缺少金鑰或啟動條件。`--rebuild` 僅在 87 章全部有效時建置，不自動發布到正式網址。

```bash
.venv-summaries/bin/python -m unittest discover -s tests -p 'test_summaries.py'
npm test
npm run typecheck
```
