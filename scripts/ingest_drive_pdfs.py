#!/usr/bin/env python3
"""Download 87 Drive chapter PDFs and convert them into VitePress Markdown.

Credentials are read only from the environment / ADC; never stored or logged.
Use --local-only after downloads made with a connected Google Drive account.
Conversion is deterministic text extraction, not translation or medical editing.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import math
import multiprocessing
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

import yaml
from tqdm import tqdm

PROJECT = Path(__file__).resolve().parents[1]
BOOK = "Miller's Anesthesia, 10th Edition"
EXPECTED = set(range(1, 88))
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
SECRET_NAMES = (
    'GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_OAUTH_TOKEN_JSON', 'GOOGLE_ACCESS_TOKEN', 'GDRIVE_API_KEY', 'GOOGLE_API_KEY',
)


def safe_error(error: BaseException) -> str:
    # HttpError.__str__ includes the request URL, potentially with an API key.
    if hasattr(error, 'resp'):
        return f'Google Drive HTTP {error.resp.status}；請確認 OAuth/service account 權限。'
    text = str(error)
    for name in SECRET_NAMES:
        secret = os.getenv(name)
        if secret:
            text = text.replace(secret, '[REDACTED]')
    text = re.sub(r'https?://\S+', '[URL]', text)
    return f'{type(error).__name__}: {text[:600]}'


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def chapter_number(name: str) -> int | None:
    match = re.match(r'^(?:(?:chapter|ch)[\s._-]*)?(\d{1,3})(?=[\s.,:_-]|$)', Path(name).stem, re.I)
    return int(match[1]) if match else None


def select_chapters(files: list[dict]) -> tuple[list[dict], list[str]]:
    chapters: dict[int, dict] = {}
    ignored = []
    for item in files:
        name = item.get('name', item.get('title', ''))
        if not name.lower().endswith('.pdf'):
            continue
        number = chapter_number(name)
        if number is None:
            ignored.append(name)
            continue
        if number not in EXPECTED:
            raise ValueError(f'PDF 章號超出 1–87：{name}')
        if number in chapters:
            raise ValueError(f'第 {number} 章重複：{chapters[number]["name"]} / {name}')
        if Path(name).name != name or '/' in name or '\\' in name:
            raise ValueError(f'PDF 檔名包含路徑：第 {number} 章')
        chapters[number] = {**item, 'name': name, 'chapter': number}
    missing = sorted(EXPECTED - chapters.keys())
    if missing:
        raise ValueError(f'缺少 {len(missing)} 章：{missing}；不會產生假內容。')
    return [chapters[number] for number in sorted(chapters)], ignored


def drive_service():
    import google.auth
    from google.auth.exceptions import DefaultCredentialsError
    from google.oauth2.credentials import Credentials
    import google_auth_httplib2
    from googleapiclient.discovery import build
    import httplib2

    credentials = None
    method = ''
    for name in ('GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_OAUTH_TOKEN_JSON'):
        if os.getenv(name):
            credentials, _ = google.auth.load_credentials_from_dict(json.loads(os.environ[name]), scopes=SCOPES)
            method = name
            break
    if credentials is None and os.getenv('GOOGLE_ACCESS_TOKEN'):
        credentials = Credentials(token=os.environ['GOOGLE_ACCESS_TOKEN'], scopes=SCOPES)
        method = 'GOOGLE_ACCESS_TOKEN'
    if credentials is None:
        try:
            credentials, _ = google.auth.default(scopes=SCOPES)
            method = 'Application Default Credentials'
        except DefaultCredentialsError:
            pass
    api_key = os.getenv('GDRIVE_API_KEY') or os.getenv('GOOGLE_API_KEY')
    if credentials is None and not api_key:
        raise RuntimeError('找不到 Google 憑證。設定 GOOGLE_APPLICATION_CREDENTIALS_JSON、GOOGLE_APPLICATION_CREDENTIALS 或 OAuth 憑證；若 PDF 已下載，使用 --local-only。')
    # PySocks is required for httplib2 proxy support. Retain proxy and CA trust.
    proxy_url = os.getenv('HTTPS_PROXY') or os.getenv('https_proxy') or os.getenv('HTTP_PROXY') or os.getenv('http_proxy')
    proxy = httplib2.proxy_info_from_url(proxy_url) if proxy_url else None
    transport = httplib2.Http(timeout=120, proxy_info=proxy, ca_certs=os.getenv('SSL_CERT_FILE') or os.getenv('REQUESTS_CA_BUNDLE'))
    if credentials:
        http = google_auth_httplib2.AuthorizedHttp(credentials, http=transport)
        print(f'驗證方式：{method}', flush=True)
        return build('drive', 'v3', http=http, cache_discovery=False)
    print('驗證方式：API key（不代表使用者授權，通常只能存取公開檔案）', flush=True)
    return build('drive', 'v3', http=transport, developerKey=api_key, cache_discovery=False)


def list_drive_files(service, query: str) -> list[dict]:
    result = []
    token = None
    while True:
        response = service.files().list(
            q=query, pageSize=1000, pageToken=token, spaces='drive',
            includeItemsFromAllDrives=True, supportsAllDrives=True,
            fields='nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,modifiedTime,webViewLink)',
        ).execute(num_retries=3)
        if response.get('incompleteSearch'):
            raise RuntimeError('Drive 回報搜尋不完整；請提供 --folder-id。')
        result.extend(response.get('files', []))
        token = response.get('nextPageToken')
        if not token:
            return result


def locate_folder(service, folder_id: str | None, name: str) -> dict:
    if folder_id:
        folder = service.files().get(fileId=folder_id, fields='id,name,mimeType', supportsAllDrives=True).execute(num_retries=3)
        if folder.get('mimeType') != 'application/vnd.google-apps.folder':
            raise ValueError('提供的 ID 不是 Drive 資料夾。')
        return folder
    escaped = name.replace('\\', '\\\\').replace("'", "\\'")
    folders = list_drive_files(service, f"trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '{escaped}'")
    if len(folders) != 1:
        raise ValueError(f'找到 {len(folders)} 個同名資料夾，請用 --folder-id 指定。')
    return folders[0]


def file_digest(path: Path, algorithm='sha256') -> str:
    checksum = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def valid_pdf(path: Path, metadata: dict) -> bool:
    if not path.is_file() or path.stat().st_size < 20:
        return False
    if metadata.get('size') and path.stat().st_size != int(metadata['size']):
        return False
    with path.open('rb') as stream:
        if not stream.read(1024).lstrip().startswith(b'%PDF-'):
            return False
    if metadata.get('md5Checksum') and file_digest(path, 'md5') != metadata['md5Checksum']:
        return False
    import pymupdf
    try:
        with pymupdf.open(path) as doc:
            return doc.page_count > 0 and not doc.needs_pass
    except Exception:
        return False


def download_pdfs(service, chapters: list[dict], destination: Path) -> dict:
    from googleapiclient.http import MediaIoBaseDownload
    destination.mkdir(parents=True, exist_ok=True)
    downloaded = reused = 0
    for chapter in tqdm(chapters, desc='下載章節', unit='章', dynamic_ncols=True, mininterval=1):
        target = destination / chapter['name']
        if valid_pdf(target, chapter):
            reused += 1
            continue
        part = target.with_suffix('.pdf.part')
        request = service.files().get_media(fileId=chapter['id'], supportsAllDrives=True)
        try:
            with part.open('wb') as stream, tqdm(total=int(chapter.get('size', 0)) or None, desc=f'第 {chapter["chapter"]:02d} 章', unit='B', unit_scale=True, leave=False, mininterval=1) as bar:
                downloader = MediaIoBaseDownload(stream, request, chunksize=8 * 1024 * 1024)
                done = False
                while not done:
                    status, done = downloader.next_chunk(num_retries=3)
                    if status:
                        bar.update(status.resumable_progress - bar.n)
            if not valid_pdf(part, chapter):
                raise ValueError(f'第 {chapter["chapter"]} 章 PDF 大小、校驗碼或格式不符。')
            part.replace(target)
            downloaded += 1
        finally:
            part.unlink(missing_ok=True)
    return {'downloaded_this_run': downloaded, 'reused_valid_pdfs': reused}


def plain_heading(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'[*_`#]', '', text)
    return ' '.join(text.replace('\xad', '').split())


def extract_title(doc, filename: str, chapter: int) -> tuple[str, str]:
    toc = doc.get_toc()
    candidates = [(item[1], 'PDF outline') for item in toc if item[0] == 1]
    candidates.append((doc.metadata.get('title', ''), 'PDF metadata'))
    candidates.append((Path(filename).stem, 'PDF filename'))
    for value, source in candidates:
        clean = plain_heading(value)
        clean = re.sub(r'^(?:(?:Chapter|CHAPTER)\s*)?' + str(chapter) + r'\s*[.\-–—,:]?\s*', '', clean)
        if len(clean) > 4 and not clean.lower().endswith('.pdf'):
            return clean, source
    raise ValueError(f'第 {chapter} 章無法擷取標題。')


def margin_artifacts(doc) -> set[str]:
    """Only identify repeated short text in page margins, never body dosages."""
    occurrences: Counter[str] = Counter()
    for page in doc:
        height = page.rect.height
        seen = set()
        for block in page.get_text('blocks'):
            if block[1] > height * .055 and block[3] < height * .945:
                continue
            for line in block[4].splitlines():
                normalized = plain_heading(line)
                if 4 < len(normalized) < 180:
                    seen.add(normalized)
        occurrences.update(seen)
    threshold = max(3, math.ceil(doc.page_count * .35))
    return {text for text, count in occurrences.items() if count >= threshold}


def normalize_asset_links(text: str) -> str:
    # PyMuPDF may make image paths relative to its process cwd, even when
    # image_path is absolute. Persist paths relative to the final Markdown file.
    return re.sub(r'(!\[[^\]]*\]\()(?:[^)\n]*?)(assets/chapter-\d{2}/)', r'\1\2', text)


def normalize_inline_markup(text: str) -> str:
    # PDF extraction may mix Markdown bold delimiters with HTML superscripts,
    # producing crossed tags after Markdown rendering. Keep the visible symbols.
    def inline(match):
        content = re.sub(r'(\*\*|__)(.*?)\1', r'\2', match[2], flags=re.S)
        content = content.replace('*', '&#42;').replace('_', '&#95;')
        return f'<{match[1]}>{content}</{match[1]}>'
    text = re.sub(r'<(sup|sub)>(.*?)</\1>', inline, text, flags=re.S)
    text = re.sub(r'(?:<|&lt;)!--\s*(?:Start|End) of picture text\s*--(?:>|&gt;)', '', text)
    text = text.replace('&lt;mark>', '<mark>').replace('&lt;/mark>', '</mark>')
    return text


def clean_markdown(text: str, artifacts: set[str], image_root: Path, relative_images: str) -> tuple[str, int]:
    # No NFKC normalization, arithmetic, unit conversion or digit substitution.
    for before, after in {'\ufb01': 'fi', '\ufb02': 'fl', '\ufb00': 'ff', '\ufb03': 'ffi', '\ufb04': 'ffl', '\xad': ''}.items():
        text = text.replace(before, after)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    text = text.replace(str(image_root).replace('\\', '/') + '/', relative_images + '/')
    text = normalize_asset_links(text)
    # PDF text is not Vue code. Keep sub/superscripts and table line breaks.
    text = re.sub(r'<(?!/?(?:sup|sub|br|mark)\b[^>]*>)', '&lt;', text, flags=re.I)
    text = normalize_inline_markup(text)
    text = text.replace('{{', '&#123;&#123;').replace('}}', '&#125;&#125;')
    text = re.sub(r'(?m)^(\s*[-*]\s+)ᑏ\s*', r'\1', text)
    text = text.replace('**KEY POINTS** ᑏ ', '**KEY POINTS** ')
    lines = []
    removed = 0
    for line in text.splitlines():
        normalized = plain_heading(line)
        if normalized in artifacts and not line.startswith(('|', '![')):
            removed += 1
            continue
        # Normalize heading levels to the website's H1/H2/H3 structure.
        match = re.match(r'^(#{1,6})\s+(.+?)\s*$', line)
        if match:
            level = min(len(match[1]), 3)
            line = '#' * level + ' ' + plain_heading(match[2])
        lines.append(line.rstrip())
    return re.sub(r'\n{4,}', '\n\n\n', '\n'.join(lines)).strip(), removed


def convert_chapter(job: dict) -> dict:
    # Each process opens its own document; PyMuPDF objects are not thread-safe.
    import pymupdf
    import pymupdf4llm
    pdf = Path(job['pdf_path'])
    output = Path(job['output'])
    number = job['chapter']
    image_root = output / 'assets' / f'chapter-{number:02d}'
    image_root.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(pdf) as doc:
        if doc.needs_pass:
            raise ValueError(f'第 {number} 章 PDF 有密碼保護。')
        title, title_source = extract_title(doc, job['name'], number)
        pages = doc.page_count
        empty_pages = [i + 1 for i, page in enumerate(doc) if len(page.get_text().strip()) < 30]
        if len(empty_pages) > max(1, pages * .2):
            raise ValueError(f'第 {number} 章缺少可擷取文字，需另行 OCR；不產生不完整章節。')
        artifacts = margin_artifacts(doc)
        chunks = pymupdf4llm.to_markdown(
            doc, page_chunks=True, header=False, footer=False,
            use_ocr=False, write_images=True, image_path=str(image_root),
            image_format='png', filename=f'Chapter_{number:02d}.pdf', dpi=150, show_progress=False,
        )
    if len(chunks) != pages:
        raise ValueError(f'第 {number} 章擷取頁數不符：{len(chunks)} / {pages}')
    texts = []
    removed = 0
    for index, chunk in enumerate(chunks, 1):
        text, count = clean_markdown(chunk['text'], artifacts, image_root, f'assets/chapter-{number:02d}')
        removed += count
        texts.append(f'<!-- PDF page {index} -->\n\n{text}')
    body = '\n\n'.join(texts)
    # The clean chapter title is the only H1. Preserve all remaining content.
    first_heading = re.search(r'^#\s+(.+)\n?', body, flags=re.M)
    if first_heading:
        extracted = re.sub(r'[^\w]', '', plain_heading(first_heading[1])).casefold()
        expected_title = re.sub(r'[^\w]', '', title).casefold()
        if expected_title in extracted:
            body = body[:first_heading.start()] + body[first_heading.end():]
    body = re.sub(r'^#\s+', '## ', body, flags=re.M)
    if len(body.strip()) < 100:
        raise ValueError(f'第 {number} 章擷取內容過少。')
    frontmatter = {'title': title, 'chapter': number, 'book': BOOK, 'source_file': job['name']}
    document = '---\n' + yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False).strip() + '\n---\n\n# ' + title + '\n\n' + body.strip() + '\n'
    target = output / f'Chapter_{number:02d}.md'
    target.write_text(document, encoding='utf-8')
    figures = list(image_root.glob('*.png'))
    return {
        'chapter': number, 'title': title, 'title_source': title_source,
        'source_file': job['name'], 'pdf_sha256': file_digest(pdf), 'pdf_bytes': pdf.stat().st_size,
        'pdf_pages': pages, 'markdown_file': target.name, 'markdown_bytes': target.stat().st_size,
        'markdown_sha256': file_digest(target), 'figures': len(figures),
        'table_rows': len(re.findall(r'^\|.*\|\s*$', body, flags=re.M)),
        'headings': len(re.findall(r'^#{2,3} ', body, flags=re.M)),
        'removed_margin_lines': removed, 'short_text_pages': empty_pages,
        'replacement_characters': body.count('\ufffd'),
    }


def verify_outputs(output: Path) -> dict:
    expected = {f'Chapter_{number:02d}.md' for number in EXPECTED}
    actual = {file.name for file in output.glob('*.md')}
    if actual != expected:
        raise ValueError(f'Markdown 檔案集合不符；缺少 {sorted(expected - actual)}，多出 {sorted(actual - expected)}')
    for number in sorted(EXPECTED):
        text = (output / f'Chapter_{number:02d}.md').read_text(encoding='utf-8')
        sections = text.split('---', 2)
        if len(sections) != 3 or sections[0]:
            raise ValueError(f'第 {number} 章 YAML frontmatter 格式錯誤。')
        metadata = yaml.safe_load(sections[1])
        if metadata.get('chapter') != number or metadata.get('book') != BOOK or not metadata.get('title') or not metadata.get('source_file'):
            raise ValueError(f'第 {number} 章 frontmatter 欄位不符。')
        if not re.search(r'^# ', sections[2], re.M) or len(sections[2].strip()) < 100:
            raise ValueError(f'第 {number} 章缺少標題或內文。')
        # Extractor emits one image per line. Capture through the final ')'
        # because source-derived image filenames may themselves contain '(...)'.
        for target in re.findall(r'^!\[[^\]]*\]\(([^\n]+)\)\s*$', sections[2], re.M):
            image = (output / target).resolve()
            if not image.is_relative_to(output.resolve()) or not image.is_file():
                raise ValueError(f'第 {number} 章圖檔不存在：{target}')
    return {'markdown_count': len(actual), 'chapter_numbers_complete': True, 'frontmatter_valid': True, 'local_images_valid': True}


def preserve_source_pages(output: Path, chapters: list[dict], pdf_dir: Path) -> None:
    """Retain original table layout and unrecognized glyphs as source images.

    Markdown cannot express arbitrary merged table cells. Original page images
    let readers verify headers and units instead of silently trusting a reflow.
    """
    import pymupdf
    for chapter in tqdm(chapters, desc='保留表格與符號原頁', unit='章', mininterval=1):
        path = output / chapter['markdown_file']
        markdown = normalize_inline_markup(normalize_asset_links(path.read_text(encoding='utf-8')))
        # A resumed finalization may already have added these source snapshots.
        if chapter.get('source_pages_preserved'):
            path.write_text(markdown, encoding='utf-8')
            chapter.update(markdown_bytes=path.stat().st_size, markdown_sha256=file_digest(path))
            continue
        sections = re.split(r'(<!-- PDF page \d+ -->)', markdown)
        images, review_pages = [], []
        with pymupdf.open(pdf_dir / chapter['source_file']) as doc:
            for index in range(1, len(sections), 2):
                page_number = int(re.search(r'\d+', sections[index])[0])
                body = sections[index + 1]
                unknown = '\ufffd' in body
                has_table = bool(re.search(r'^\|.*\|\s*$', body, re.M))
                if not unknown and not has_table:
                    continue
                image = output / 'assets' / f'chapter-{chapter["chapter"]:02d}' / f'source-page-{page_number:04d}.png'
                doc[page_number - 1].get_pixmap(matrix=pymupdf.Matrix(1.7, 1.7)).save(image)
                images.append(page_number)
                if unknown:
                    review_pages.append(page_number)
                    body += '\n\n::: warning 符號需核對\n此頁有符號無法完整擷取，請展開下方原始頁面核對。\n:::\n'
                body += f'\n\n::: details 原始表格與符號（PDF 第 {page_number} 頁）\n\n![第 {chapter["chapter"]} 章，原始 PDF 第 {page_number} 頁](assets/chapter-{chapter["chapter"]:02d}/{image.name})\n\n:::\n\n'
                sections[index + 1] = body
        path.write_text(''.join(sections), encoding='utf-8')
        chapter.update(
            source_pages_preserved=True, source_image_pages=images, needs_review_pages=review_pages,
            markdown_bytes=path.stat().st_size, markdown_sha256=file_digest(path),
            figures=len(list((output / 'assets' / f'chapter-{chapter["chapter"]:02d}').glob('*.png'))),
        )


def publish_output(staging: Path, output: Path) -> None:
    # Preserve existing chapters until the complete new conversion has passed.
    output.parent.mkdir(parents=True, exist_ok=True)
    backup = output.with_name(output.name + '.backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    if output.exists():
        output.rename(backup)
    try:
        staging.rename(output)
    except Exception:
        if backup.exists():
            backup.rename(output)
        raise
    if backup.exists():
        print(f'原輸出備份：{backup}', flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder-name', default="Miller's Anesthesia 10ed")
    parser.add_argument('--folder-id', default=os.getenv('GOOGLE_DRIVE_FOLDER_ID'))
    parser.add_argument('--pdf-dir', type=Path, default=Path('/workspace/input_pdf'))
    parser.add_argument('--output-dir', type=Path, default=PROJECT / 'output_md')
    parser.add_argument('--manifest', type=Path, help='Drive metadata JSON for connected-account downloads')
    parser.add_argument('--local-only', action='store_true', help='Validate and convert PDFs already downloaded')
    parser.add_argument('--download-only', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Resume verified chapter conversions from the previous report/staging directory')
    parser.add_argument('--workers', type=int, default=2, help='Independent conversion processes (default: 2)')
    parser.add_argument('--build', action='store_true', help='Run npm run build:complete after all 87 files pass verification')
    parser.add_argument('--report', type=Path, default=PROJECT / 'reports/ingestion-summary.json')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.workers < 1 or args.workers > 8:
        raise ValueError('--workers 必須介於 1–8。')
    report = {'started_at': datetime.now(timezone.utc).isoformat(), 'status': 'running', 'book': BOOK, 'pdf_dir': str(args.pdf_dir), 'output_dir': str(args.output_dir)}
    previous = json.loads(args.report.read_text(encoding='utf-8')) if args.resume and args.report.exists() else {}
    staging = None
    try:
        args.pdf_dir.mkdir(parents=True, exist_ok=True)
        if args.local_only:
            if args.manifest:
                manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
                files = manifest['files']
                report['download_method'] = manifest.get('download_method', 'pre_downloaded_files_with_drive_metadata')
                report['folder_id'] = manifest.get('folder_id')
            else:
                files = [{'name': file.name, 'size': file.stat().st_size} for file in args.pdf_dir.glob('*.pdf')]
                report['download_method'] = 'pre_downloaded_local_files'
            chapters, ignored = select_chapters(files)
            if args.manifest:
                ignored.extend(manifest.get('ignored_nonchapter_pdfs', []))
            for chapter in tqdm(chapters, desc='驗證已下載 PDF', unit='章', mininterval=1):
                if not valid_pdf(args.pdf_dir / chapter['name'], chapter):
                    raise ValueError(f'第 {chapter["chapter"]} 章 PDF 不存在、大小不符或損毀。')
            report['reused_valid_pdfs'] = len(chapters)
        else:
            service = drive_service()
            folder = locate_folder(service, args.folder_id, args.folder_name)
            report.update(folder_id=folder['id'], download_method='google_api_python_client')
            files = list_drive_files(service, f"'{folder['id']}' in parents and trashed = false and mimeType = 'application/pdf'")
            chapters, ignored = select_chapters(files)
            report.update(download_pdfs(service, chapters, args.pdf_dir))
            atomic_json(args.pdf_dir / '.drive-manifest.json', {'folder_id': folder['id'], 'files': chapters, 'download_method': 'google_api_python_client'})
        report.update(pdf_count=len(chapters), ignored_nonchapter_pdfs=ignored)
        print(f'PDF 已就緒：{len(chapters)} / 87，依章號排序；排除 {len(ignored)} 個非章節 PDF。', flush=True)
        if args.download_only:
            report['status'] = 'downloaded'
            return 0
        args.output_dir.parent.mkdir(parents=True, exist_ok=True)
        resume_dir = previous.get('partial_conversion_dir', previous.get('staging_dir'))
        if args.resume and resume_dir and Path(resume_dir).is_dir():
            staging = Path(resume_dir).resolve()
            if staging.parent != args.output_dir.parent.resolve() or not staging.name.startswith('.miller-conversion-'):
                raise ValueError('報告的暫存目錄不屬於這個專案。')
        else:
            staging = Path(tempfile.mkdtemp(prefix='.miller-conversion-', dir=args.output_dir.parent))
            if args.resume and previous.get('markdown_count') == 87 and args.output_dir.is_dir():
                shutil.copytree(args.output_dir, staging, dirs_exist_ok=True)
        report['staging_dir'] = str(staging)
        completed = []
        for result in previous.get('chapters', []) if args.resume else []:
            md = staging / result['markdown_file']
            pdf = args.pdf_dir / result['source_file']
            if md.is_file() and pdf.is_file() and file_digest(md) == result['markdown_sha256'] and file_digest(pdf) == result['pdf_sha256']:
                completed.append(result)
        completed_numbers = {result['chapter'] for result in completed}
        if completed:
            print(f'重用已校驗的轉換結果：{len(completed)} 章。', flush=True)
        jobs = [{**chapter, 'pdf_path': str((args.pdf_dir / chapter['name']).resolve()), 'output': str(staging)} for chapter in chapters if chapter['chapter'] not in completed_numbers]
        report['converted_count'] = len(completed)
        report['chapters'] = sorted(completed, key=lambda item: item['chapter'])
        atomic_json(args.report, report)
        with ProcessPoolExecutor(max_workers=args.workers, mp_context=multiprocessing.get_context('spawn')) as executor:
            futures = {executor.submit(convert_chapter, job): job['chapter'] for job in jobs}
            with tqdm(total=87, initial=len(completed), desc='轉換 Markdown', unit='章', mininterval=1, dynamic_ncols=True) as bar:
                for future in as_completed(futures):
                    result = future.result()
                    completed.append(result)
                    bar.set_postfix(chapter=f'{result["chapter"]:02d}', pages=result['pdf_pages'])
                    bar.update(1)
                    report['converted_count'] = len(completed)
                    report['chapters'] = sorted(completed, key=lambda item: item['chapter'])
                    atomic_json(args.report, report)
        preserve_source_pages(staging, completed, args.pdf_dir)
        report['chapters'] = sorted(completed, key=lambda item: item['chapter'])
        report['needs_review'] = [{'chapter': chapter['chapter'], 'pdf_pages': chapter['needs_review_pages']} for chapter in completed if chapter.get('needs_review_pages')]
        atomic_json(args.report, report)
        report.update(verify_outputs(staging))
        publish_output(staging, args.output_dir)
        staging = None
        report.update(verify_outputs(args.output_dir))
        report['pdf_pages_total'] = sum(item['pdf_pages'] for item in completed)
        report['figure_count'] = sum(item['figures'] for item in completed)
        report['table_rows_total'] = sum(item['table_rows'] for item in completed)
        report['status'] = 'converted'
        report['build_status'] = 'not_requested'
        if args.build:
            print('87 章皆通過驗證，執行 npm run build:complete…', flush=True)
            build = subprocess.run(['npm', 'run', 'build:complete'], cwd=args.output_dir.parent, check=False)
            report['build_status'] = 'passed' if build.returncode == 0 else 'failed'
            if build.returncode:
                report['status'] = 'converted_build_failed'
                return 2
        report['status'] = 'success'
        return 0
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = safe_error(error)
        if staging:
            report['partial_conversion_dir'] = str(staging)
        print(report['error'], file=sys.stderr, flush=True)
        return 1
    finally:
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        atomic_json(args.report, report)
        print(json.dumps({key: report.get(key) for key in ('status', 'download_method', 'pdf_count', 'converted_count', 'markdown_count', 'pdf_pages_total', 'figure_count', 'build_status', 'error') if key in report}, ensure_ascii=False, indent=2), flush=True)
        print(f'詳細報告：{args.report}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
