"""Synthetic fixtures only: no generated clinical content is added to the book."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import requests

import generate_chapter_summaries as summaries


QUOTE = "The simulated fixture contains 2 mg/kg and describes a test, not clinical guidance."
BODY = "\n# Synthetic Test Chapter\n\n<!-- PDF page 1 -->\n\n" + QUOTE + "\n\n![figure](assets/test.png)\n"
RAW = "---\nchapter: 1\ntitle: Synthetic Test Chapter\nsource_file: test.pdf\n---\n" + BODY


def fixture_data():
    # Enough Chinese characters to exercise substantive-content checks, not medicine.
    text = "這是只用於驗證程式的測試句子，說明資料結構與來源核對的流程，不包含臨床處置建議。" * 2
    item = {"text": text, "evidence": [{"page": 1, "quote": QUOTE}]}
    return {**{name: [copy.deepcopy(item) for _ in range(3)] for name in summaries.SECTIONS}, "source_cautions": []}


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.original = self.root / "Chapter_01.md"
        self.original.write_text(RAW)
        self.source = summaries.read_source(self.original, 1)
        self.data = fixture_data()
        self.pages = summaries.extract_pages(BODY)

    def tearDown(self):
        self.temp.cleanup()

    def test_complete_original_body_and_exact_hierarchy_are_retained(self):
        summaries.validate_response(self.data, self.pages)
        text = summaries.format_summary(self.source, "測試章名", self.data, "test-model", "test-date")
        self.assertEqual(text.split(summaries.ORIGINAL_MARKER, 1)[1], BODY)
        self.assertEqual(self.original.read_text(), RAW)
        self.assertIn("# 第 1 章 測試章名：重點精華總整理", text)
        headings = [text.index(heading) for heading in summaries.HEADINGS]
        self.assertEqual(headings, sorted(headings))
        self.assertIn("(#pdf-page-1)", text)
        self.assertIn("assets/test.png", text)

    def test_fabricated_quotation_or_page_is_rejected(self):
        for ref in ({"page": 2, "quote": QUOTE}, {"page": 1, "quote": "This quotation never occurs in the source passage at all."}):
            with self.subTest(ref=ref):
                data = copy.deepcopy(self.data)
                data["core"][0]["evidence"] = [ref]
                with self.assertRaises(summaries.SummaryError):
                    summaries.validate_response(data, self.pages)

    def test_unsupported_numeric_claim_is_rejected(self):
        self.data["dosing_monitoring"][0]["text"] += " 使用 999 mg。"
        with self.assertRaisesRegex(summaries.SummaryError, "數值"):
            summaries.validate_response(self.data, self.pages)

    def test_missing_source_is_allowed_only_for_fixed_unavailable_statements(self):
        self.data["dosing_monitoring"] = [{"text": summaries.UNAVAILABLE["dosing_monitoring"], "evidence": []}]
        summaries.validate_response(self.data, self.pages)
        self.data["core"][0]["evidence"] = []
        with self.assertRaisesRegex(summaries.SummaryError, "來源摘錄"):
            summaries.validate_response(self.data, self.pages)

    def test_checkpoint_rejects_tampering_and_changed_source_or_model(self):
        output, record = self.root / "summary.md", self.root / "checkpoint.json"
        model, title = "test-model", "測試章名"
        response = {"data": self.data, "review": {"approved": True, "issues": []}}
        text = summaries.format_summary(self.source, title, self.data, model, "date")
        summaries.atomic(output, text)
        summaries.save_json(record, {"fingerprint": summaries.fingerprint(self.source, title, model),
            "generated_at": "date", "output_sha256": summaries.sha(text), "response": response})
        self.assertIsNotNone(summaries.valid_checkpoint(output, record, self.source, title, model))
        self.assertIsNone(summaries.valid_checkpoint(output, record, self.source, title, "new-model"))
        changed = dict(self.source, sha256=summaries.sha("changed source"))
        self.assertIsNone(summaries.valid_checkpoint(output, record, changed, title, model))
        output.write_text(text.replace("測試章名", "被修改章名"))
        self.assertIsNone(summaries.valid_checkpoint(output, record, self.source, title, model))

    def test_missing_pages_fail_instead_of_silently_truncating(self):
        with self.assertRaises(summaries.SummaryError):
            summaries.extract_pages("No page provenance")
        with self.assertRaises(summaries.SummaryError):
            summaries.extract_pages("<!-- PDF page 1 -->A<!-- PDF page 1 -->B")

    def test_model_generated_markup_cannot_execute(self):
        text = summaries.escape_inline("{{danger}} <script> *bold* [link](url)")
        for forbidden in ("{{", "<script>", "*bold*", "[link]"):
            self.assertNotIn(forbidden, text)
        self.assertEqual(summaries.escape_inline("< 2 & > 1"), "&#60; 2 &#38; &#62; 1")

    @patch.object(summaries, "wait_seconds")
    def test_rate_limit_retry_keeps_key_in_header_and_respects_retry_after(self, wait):
        client = summaries.Gemini("synthetic-test-token", "test-model", 0, 2)
        limited = Mock(status_code=429, headers={"Retry-After": "12"})
        success = Mock(status_code=200)
        success.json.return_value = {"ok": True}
        client.session.request = Mock(side_effect=[limited, success])
        self.assertEqual(client.request(":countTokens", {}), {"ok": True})
        self.assertEqual(client.session.request.call_count, 2)
        wait.assert_any_call(12.0)
        self.assertEqual(client.session.headers["x-goog-api-key"], "synthetic-test-token")
        for call in client.session.request.call_args_list:
            self.assertNotIn("synthetic-test-token", call.args[1])
            self.assertFalse(call.kwargs["allow_redirects"])

    def test_auth_failure_is_fatal_and_does_not_log_provider_body(self):
        client = summaries.Gemini("synthetic-test-token", "test-model", 0, 2)
        response = Mock(status_code=403, text="do not print provider payload")
        client.session.request = Mock(return_value=response)
        with self.assertRaises(summaries.APIError) as raised:
            client.request("")
        self.assertTrue(raised.exception.fatal)
        self.assertNotIn("payload", str(raised.exception))
        self.assertEqual(client.session.request.call_count, 1)

    def test_semantic_dose_review_rejects_unit_mismatch(self):
        client = summaries.Gemini("synthetic-test-token", "test-model", 0, 0)
        client.request = Mock(return_value={"candidates": [{"finishReason": "STOP", "content": {"parts": [
            {"text": json.dumps({"approved": False, "issues": ["測試條列的單位不符"]})}]}}]})
        with self.assertRaisesRegex(summaries.SummaryError, "單位不符"):
            client.review(self.data)


if __name__ == "__main__":
    unittest.main()
