import os
import re
import json
import httpx
from io import BytesIO
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from PyPDF2 import PdfReader

# NEW SDK
from google import genai
from google.genai import types

load_dotenv()

# Prefer GOOGLE_API_KEY but fall back to GEMINI_API_KEY if present
API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable with your API key")

# Create a global client
client = genai.Client(api_key=API_KEY)

def _extract_json_from_text(text: str) -> Optional[dict]:
    """
    Extract the first JSON object from text using a safe regex and return parsed dict,
    or None if parsing fails.
    """
    # Find the first balanced {...} block roughly (simple greedy approach)
    match = re.search(r'\{(?:[^{}]++|(?R))*\}', text, re.DOTALL) if hasattr(re, 'R') else re.search(r'\{.*\}', text, re.DOTALL)
    # Note: Python's re does not support recursion by default in many versions; fallback to simple greedy above.
    if not match:
        # fallback simpler extraction
        match = re.search(r'\{.*\}', text, re.DOTALL)

    if not match:
        return None
    json_str = match.group()
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # Try basic cleanup: remove trailing commas, etc. (best-effort)
        cleaned = re.sub(r',\s*}', '}', json_str)
        cleaned = re.sub(r',\s*\]', ']', cleaned)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None

class GeminiService:
    def __init__(self, model: str = "gemini-2.5-flash"):
        """
        model: pick the available model in your account (e.g. gemini-2.5-flash).
        """
        self.client = client
        self.model = model

    async def _download_pdf(self, pdf_url: str, timeout: float = 60.0) -> bytes:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(pdf_url, timeout=timeout)
            resp.raise_for_status()
            return resp.content

    def _extract_pdf_text_and_metadata(self, pdf_bytes: bytes, max_pages: int = 6) -> (dict, str):
        """
        Extract a few pages of text and basic metadata using PyPDF2.
        Returns (metadata, extracted_text).
        """
        reader = PdfReader(BytesIO(pdf_bytes))
        meta = {}
        doc_info = reader.metadata or {}
        meta['pages'] = len(reader.pages)
        # Doc info keys in PyPDF2 are like '/Author'
        meta['author'] = doc_info.get('/Author') if doc_info else None
        meta['subject'] = doc_info.get('/Subject') if doc_info else None
        meta['creator'] = doc_info.get('/Creator') if doc_info else None
        meta['producer'] = doc_info.get('/Producer') if doc_info else None

        texts: List[str] = []
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            # include a header to indicate page number in extracted text (helps LLM map content)
            texts.append(f"[PDF_PAGE:{i+1}]\n{page_text.strip()}")
        extracted_text = "\n\n".join(t for t in texts if t and t.strip())
        return meta, extracted_text

    async def analyze_pdf(self, pdf_url: str, filename: str) -> Dict[str, Any]:
        """
        Hybrid approach: extract first pages locally for fast metadata + small prompt,
        then ask Gemini (via new SDK) to produce a small JSON with title/description/metadata.
        """
        try:
            pdf_bytes = await self._download_pdf(pdf_url)
            metadata, extracted_text = self._extract_pdf_text_and_metadata(pdf_bytes, max_pages=6)

            prompt = f"""You are a helpful document analyzer.

                Filename: {filename}
                Metadata:
                {json.dumps(metadata)}

                Below are the extracted contents from the first few PDF pages (prefixed with [PDF_PAGE:<n>]):
                \"\"\"
                {extracted_text}
                \"\"\"

                Return a JSON object ONLY (no commentary) with these keys:
                - title: short descriptive title (max 100 chars)
                - description: concise summary (max 300 chars)
                - metadata: object that includes at least pages, author, subject, creator, producer

                Example valid response:
                {{
                "title": "My Document Title",
                "description": "Short summary...",
                "metadata": {{ "pages": 42, "author": "...", "subject": "...", "creator":"...", "producer":"..." }}
                }}

                Respond with JSON only.
                """

            response = self.client.models.generate_content(
                model=self.model,
                contents=[prompt]
            )

            result_text = getattr(response, "text", None) or str(response)
            parsed = _extract_json_from_text(result_text) or {}

            # Merge/ensure defaults
            if 'title' not in parsed or not parsed.get('title'):
                parsed['title'] = filename.replace('.pdf', '').replace('_', ' ').title()
            if 'description' not in parsed or not parsed.get('description'):
                parsed['description'] = f"PDF document: {filename}"
            # Merge metadata we extracted (without overriding model-provided values)
            parsed_meta = parsed.get('metadata', {}) if isinstance(parsed.get('metadata'), dict) else {}
            for k, v in metadata.items():
                if not parsed_meta.get(k):
                    parsed_meta[k] = v
            parsed['metadata'] = parsed_meta

            return parsed

        except Exception as exc:
            print("Error analyzing PDF:", exc)
            return {
                "title": filename.replace('.pdf', '').replace('_', ' ').title(),
                "description": f"PDF document: {filename}",
                "metadata": {}
            }

    async def extract_pdf_index_content(self, pdf_url: str, filename: str, max_index_pages: int = 999) -> Dict[str, Any]:
        """
        This method sends the full PDF bytes to Gemini (as a binary part) and asks the model to
        produce a structured index (chapter/section-wise) with page mappings. The prompt
        is strict and includes a JSON schema example to coerce valid JSON-only responses.

        The returned JSON schema (example):
        {
          "title": "...",
          "index": [
            {
              "section_title": "Chapter 1: Introduction",
              "start_pdf_page": 3,            # original PDF page number (1-indexed)
              "start_document_page": 1,       # logical doc page (if different) or same as pdf page
              "summary": "One-line summary of this section",
              "subsections": [
                {
                  "subsection_title": "Background",
                  "start_pdf_page": 4,
                  "summary": "..."
                }
              ]
            },
            ...
          ]
        }
        """
        try:
            pdf_bytes = await self._download_pdf(pdf_url)

            print("Got a extract_pdf_index_content request")

            # Revamped, strict prompt with schema and examples
            prompt = f"""
                You are a document indexing assistant. You will be given a PDF file. Analyze the document and produce a structured JSON index (table of contents) that lists top-level chapters/sections and their page mappings.

                Requirements:
                1. Respond WITH ONLY VALID JSON — no extra text, no explanations.
                2. Use the following JSON structure exactly:
                {{
                "title": "<Document title or filename fallback>",
                "index": [
                    {{
                    "section_title": "<Chapter or Section title>",
                    "start_pdf_page": <integer, 1-indexed>,
                    "start_document_page": <integer, 1-indexed or same as pdf page if no separate numbering>,
                    "summary": "<one-sentence summary, max 120 chars>",
                    "subsections": [
                        {{
                        "subsection_title": "<optional>",
                        "start_pdf_page": <integer>,
                        "summary": "<one-line summary>"
                        }},
                        ...
                    ]
                    }},
                    ...
                ]
                }}

                Task:
                - Detect major sections/chapters by reading headings, larger text, or "Table of Contents" if present.
                - For each section, return the PDF page number where the section starts (1-indexed).
                - Provide a short one-line summary for each section (max 120 chars).
                - If you discover subsections, include them under "subsections" with their own start page and summary.
                - If you cannot determine exact page numbers for some items, you may approximate, but prefer exact when possible.

                Filename: {filename}

                Return the JSON only.
                """

            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                    prompt
                ],
            )

            result_text = getattr(response, "text", None) or str(response)
            parsed = _extract_json_from_text(result_text) or {}

            # Provide defaults if necessary
            if 'title' not in parsed or not parsed.get('title'):
                parsed['title'] = filename.replace('.pdf', '').replace('_', ' ').title()
            if 'index' not in parsed or not isinstance(parsed['index'], list):
                parsed['index'] = []

            # Basic normalization: ensure ints for page fields
            for section in parsed['index']:
                if 'start_pdf_page' in section:
                    try:
                        section['start_pdf_page'] = int(section['start_pdf_page'])
                    except Exception:
                        section['start_pdf_page'] = None
                if 'start_document_page' in section:
                    try:
                        section['start_document_page'] = int(section['start_document_page'])
                    except Exception:
                        section['start_document_page'] = section.get('start_pdf_page')

                # Normalize subsections
                if 'subsections' in section and isinstance(section['subsections'], list):
                    for sub in section['subsections']:
                        if 'start_pdf_page' in sub:
                            try:
                                sub['start_pdf_page'] = int(sub['start_pdf_page'])
                            except Exception:
                                sub['start_pdf_page'] = None

            return parsed

        except Exception as exc:
            print("Error extracting PDF index content:", exc)
            # fallback minimal response
            return {
                "title": filename.replace('.pdf', '').replace('_', ' ').title(),
                "index": []
            }

# Global instance
gemini_service = GeminiService()

# Optional test run (only if executed directly)
if __name__ == "__main__":
    import asyncio
    async def main():
        test_url = "https://res.cloudinary.com/dvuhk2ymi/raw/upload/v1759302811/bookx-pdfs/rlcfmxlu6poelsekvtuw.pdf"
        # print("Analyzing sample PDF (summary)...")
        # res = await gemini_service.analyze_pdf(test_url, "sample.pdf")
        # print(json.dumps(res, indent=2))
        print("\nExtracting index/content...")
        idx = await gemini_service.extract_pdf_index_content(test_url, "sample.pdf")
        print(json.dumps(idx, indent=2))
    asyncio.run(main())
