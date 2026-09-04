from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import cross_check_numbers  # noqa: E402
import extract_deck  # noqa: E402
import validate_claims  # noqa: E402
import validate_links  # noqa: E402
import verify_refs  # noqa: E402
import verify_trials  # noqa: E402
from cn_reg_sources import chictr, nmpa  # noqa: E402


class CrossCheckTests(unittest.TestCase):
    def test_sum_match_and_mismatch(self):
        payload = {"checks": [
            {"check_id": "N-1", "type": "sum", "values": [1, 2], "stated": 3},
            {"check_id": "N-2", "type": "product", "values": [10, 3], "stated": 20},
        ]}
        result = cross_check_numbers.run(payload)
        self.assertEqual(result["summary"], {"total": 2, "matches": 1, "mismatches": 1, "errors": 0})

    def test_ratio_zero_is_error_not_crash(self):
        result = cross_check_numbers.run({"checks": [
            {"check_id": "N-1", "type": "ratio", "numerator": 1, "denominator": 0, "stated": 1}
        ]})
        self.assertEqual(result["results"][0]["status"], "error")


class ClaimValidationTests(unittest.TestCase):
    def setUp(self):
        self.valid = json.loads((Path(__file__).parent / "fixtures" / "valid_claims.json").read_text(encoding="utf-8"))

    def test_valid_fixture(self):
        self.assertEqual(validate_claims.validate(self.valid), [])

    def test_duplicate_id_and_invalid_status(self):
        duplicate = dict(self.valid["claims"][0])
        duplicate["verification_status"] = "found"
        self.valid["claims"].append(duplicate)
        errors = validate_claims.validate(self.valid)
        self.assertTrue(any("duplicated" in error for error in errors))
        self.assertTrue(any("verification_status" in error for error in errors))

    def test_slide_cannot_exceed_document_and_sources_are_checked(self):
        claim = self.valid["claims"][0]
        claim["slide"] = self.valid["document"]["pages"] + 1
        claim["external_sources"] = [{"source": "", "accessed": "", "matched_fields": "title"}]
        errors = validate_claims.validate(self.valid)
        self.assertTrue(any("exceeds document.pages" in error for error in errors))
        self.assertTrue(any("source must be a non-empty" in error for error in errors))
        self.assertTrue(any("matched_fields" in error for error in errors))


class ReferenceVerificationTests(unittest.TestCase):
    def test_unknown_citations_never_report_match(self):
        unresolved = {
            "actual": {"citations": None},
            "title": "x",
            "tag": "[无法核实]",
            "flags": [],
        }
        with patch.object(verify_refs, "verify_one", return_value=unresolved):
            result = verify_refs.verify_batch({
                "claimed_total_citations": 100,
                "papers": [{"title": "x"}],
            })
        check = result["total_citation_check"]
        self.assertFalse(check["coverage_complete"])
        self.assertIsNone(check["verified_sum"])
        self.assertIn("覆盖不完整", check["note"])


class TrialVerificationTests(unittest.TestCase):
    def test_keyword_results_are_candidates(self):
        response = {"studies": [{"protocolSection": {"identificationModule": {"nctId": "NCT1", "briefTitle": "X"}}}]}
        with patch.object(verify_trials, "_get_json", return_value=response):
            result = verify_trials.ctgov_search("x")
        self.assertEqual(result["tag"], "[候选记录·尚未匹配]")

    def test_nct_only_verifies_existence(self):
        response = {"protocolSection": {"identificationModule": {"nctId": "NCT1", "briefTitle": "X"}}}
        with patch.object(verify_trials, "_get_json", return_value=response):
            result = verify_trials.ctgov_by_nct("NCT1")
        self.assertEqual(result["tag"], "[已核实存在·ClinicalTrials.gov]")
        self.assertIn("仅核实登记记录存在", result["note"])


class ChineseSourceTests(unittest.TestCase):
    def test_chictr_detail_uses_search_project_id(self):
        match = [{"registration_number": "ChiCTR123", "project_id": "987"}]
        with patch.object(chictr, "search", return_value=match), \
             patch.object(chictr, "_fetch_html", return_value="<html></html>") as fetch, \
             patch.object(chictr, "_parse_detail", side_effect=lambda html, url: {"source_url": url}):
            result = chictr.detail(registration_number="ChiCTR123")
        self.assertTrue(result["source_url"].endswith("proj=987"))
        self.assertIn("proj=987", fetch.call_args.args[0])

    def test_udi_hint_states_limits(self):
        hint = nmpa.udi_hint()
        self.assertIn("不能核实受理号", hint)
        self.assertIn("不是完整注册证库", hint)


class PackagingTests(unittest.TestCase):
    def test_markdown_links_resolve(self):
        self.assertEqual(validate_links.validate(ROOT), [])

    def test_eval_cases_have_required_guardrails(self):
        fixture = Path(__file__).parent / "fixtures" / "eval_cases.json"
        data = json.loads(fixture.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["cases"]), 8)
        for case in data["cases"]:
            self.assertTrue(case["must_observe"])
            self.assertTrue(case["forbidden_conclusions"])


class DeckExtractionTests(unittest.TestCase):
    def test_pptx_extracts_slide_text_and_flags_visual_review(self):
        slide = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Revenue 2026</a:t></a:r></a:p>
          </p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>'''
        with tempfile.TemporaryDirectory() as tmp:
            deck = Path(tmp) / "deck.pptx"
            with zipfile.ZipFile(deck, "w") as archive:
                archive.writestr("ppt/slides/slide1.xml", slide)
            result = extract_deck.extract(deck)
        self.assertEqual(result["page_count"], 1)
        self.assertEqual(result["pages"][0]["text"], "Revenue 2026")
        self.assertTrue(result["pages"][0]["visual_review_required"])

    def test_pptx_extracts_notes_charts_media_and_hyperlinks(self):
        slide = b'''<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:t>Main</a:t></p:cSld></p:sld>'''
        rels = b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
          <Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
          <Relationship Id="r3" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/media1.mp4"/>
          <Relationship Id="r4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org" TargetMode="External"/>
        </Relationships>'''
        notes = b'''<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Private note</a:t></p:notes>'''
        chart = b'''<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Revenue</a:t><c:v>3.8</c:v></c:chartSpace>'''
        with tempfile.TemporaryDirectory() as tmp:
            deck = Path(tmp) / "deck.pptx"
            with zipfile.ZipFile(deck, "w") as archive:
                archive.writestr("ppt/slides/slide1.xml", slide)
                archive.writestr("ppt/slides/_rels/slide1.xml.rels", rels)
                archive.writestr("ppt/notesSlides/notesSlide1.xml", notes)
                archive.writestr("ppt/charts/chart1.xml", chart)
            page = extract_deck.extract(deck)["pages"][0]
        self.assertEqual(page["speaker_notes"], "Private note")
        self.assertEqual(page["charts"][0]["cached_values"], ["3.8"])
        self.assertEqual(page["embedded_media"][0]["target"], "ppt/media/media1.mp4")
        self.assertEqual(page["hyperlinks"], ["https://example.org"])

    def test_unsupported_format_is_rejected(self):
        with self.assertRaises(ValueError):
            extract_deck.extract(Path("deck.key"))


if __name__ == "__main__":
    unittest.main()
