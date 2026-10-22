import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('ingest_drive_pdfs', Path(__file__).resolve().parents[1] / 'scripts/ingest_drive_pdfs.py')
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)


class IngestionTests(unittest.TestCase):
    def files(self):
        return [{'name': f'{n}. Test chapter.pdf', 'id': str(n)} for n in range(87, 0, -1)]

    def test_numbering_and_natural_order(self):
        for name in ['1. Title.pdf', 'Chapter_01.pdf', 'ch01.pdf', '01-title.pdf', '15, Renal.pdf']:
            self.assertEqual(ingest.chapter_number(name), 15 if name.startswith('15') else 1)
        chapters, ignored = ingest.select_chapters(self.files() + [{'name': 'Content.pdf'}, {'name': 'Whole book.pdf'}])
        self.assertEqual([item['chapter'] for item in chapters], list(range(1, 88)))
        self.assertEqual(len(ignored), 2)

    def test_missing_duplicate_and_out_of_range(self):
        with self.assertRaisesRegex(ValueError, '缺少'):
            ingest.select_chapters(self.files()[:-1])
        with self.assertRaisesRegex(ValueError, '重複'):
            ingest.select_chapters(self.files() + [{'name': 'Chapter_01.pdf'}])
        with self.assertRaisesRegex(ValueError, '超出'):
            ingest.select_chapters(self.files() + [{'name': '88. Invalid.pdf'}])

    def test_preserves_units_numbers_tables_and_medical_symbols(self):
        text = '## **Test**\n\n| Drug | Dose |\n|---|---|\n| Example | 0.05–0.1 µg/kg/min |\n\nSpO₂ < 90%; CO<sub>2</sub>; x<sup>2</sup>; 5 ± 2.\n\nRepeated running header\n'
        result, count = ingest.clean_markdown(text, {'Repeated running header'}, Path('/tmp/images'), 'assets/chapter-01')
        self.assertEqual(count, 1)
        for exact in ['0.05–0.1 µg/kg/min', 'SpO₂ &lt; 90%', 'CO<sub>2</sub>', 'x<sup>2</sup>', '5 ± 2.', '|---|---|']:
            self.assertIn(exact, result)
        self.assertTrue(result.startswith('## Test'))

    def test_normalizes_cwd_relative_and_absolute_image_paths(self):
        expected = '![](assets/chapter-24/source_(Reversal).png)'
        for prefix in ['', '.miller-conversion-abcd/', '/workspace/project/.miller-conversion-abcd/']:
            self.assertEqual(ingest.normalize_asset_links(f'![]({prefix}assets/chapter-24/source_(Reversal).png)'), expected)

    def test_superscript_footnotes_do_not_cross_markdown_emphasis(self):
        text = '**(mg/kg)***<sup>**,†**</sup> x<sup>2</sup> CO<sub>2</sub>'
        result = ingest.normalize_inline_markup(text)
        self.assertIn('<sup>,†</sup>', result)
        self.assertIn('x<sup>2</sup> CO<sub>2</sub>', result)
        self.assertNotIn('Start of picture text', ingest.normalize_inline_markup('&lt;!-- Start of picture text -->\nText'))

    def test_frontmatter_and_complete_output_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            for number in range(1, 88):
                metadata = {'title': f'Title {number}', 'chapter': number, 'book': ingest.BOOK, 'source_file': f'{number}.pdf'}
                text = '---\n' + ingest.yaml.safe_dump(metadata, sort_keys=False) + '---\n\n# Test\n\n' + 'Text. ' * 30
                (output / f'Chapter_{number:02d}.md').write_text(text)
            self.assertEqual(ingest.verify_outputs(output)['markdown_count'], 87)
            (output / 'assets').mkdir()
            (output / 'assets/image_(test).png').write_bytes(b'image')
            with (output / 'Chapter_01.md').open('a') as stream:
                stream.write('\n\n![](assets/image_(test).png)\n')
            self.assertTrue(ingest.verify_outputs(output)['local_images_valid'])
            (output / 'Chapter_87.md').unlink()
            with self.assertRaisesRegex(ValueError, '檔案集合不符'):
                ingest.verify_outputs(output)

    def test_output_replacement_keeps_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            output, staging = Path(temp) / 'output_md', Path(temp) / 'staging'
            output.mkdir(); staging.mkdir()
            (output / 'old.md').write_text('original')
            (staging / 'new.md').write_text('new')
            ingest.publish_output(staging, output)
            self.assertTrue((output / 'new.md').exists())
            backups = list(Path(temp).glob('output_md.backup-*'))
            self.assertEqual((backups[0] / 'old.md').read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
