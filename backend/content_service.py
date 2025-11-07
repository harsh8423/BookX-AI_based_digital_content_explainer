import os
import json
import httpx
import tempfile
import logging
from typing import Dict, Any, Optional
from google import genai
from google.genai import types
import fitz  # PyMuPDF

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Gemini API setup
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

class ContentService:
    def __init__(self):
        self.pdf_cache = {}  # Cache loaded PDFs by pdf_id
    
    async def download_pdf_from_cloudinary(self, cloudinary_url: str) -> str:
        """Download PDF from Cloudinary and save to temporary file"""
        try:
            # Increase timeout for large PDFs
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(cloudinary_url)
                response.raise_for_status()
                
                # Create temporary file
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                temp_file.write(response.content)
                temp_file.close()
                
                return temp_file.name
        except Exception as e:
            logger.error(f"Error downloading PDF: {e}")
            raise

    async def load_pdf(self, pdf_id: str, cloudinary_url: str) -> fitz.Document:
        """Load PDF and cache it"""
        if pdf_id in self.pdf_cache:
            return self.pdf_cache[pdf_id]
        
        try:
            # Download PDF
            pdf_path = await self.download_pdf_from_cloudinary(cloudinary_url)
            
            # Open PDF with PyMuPDF
            pdf_doc = fitz.open(pdf_path)
            
            # Cache the document
            self.pdf_cache[pdf_id] = pdf_doc
            
            # Clean up temporary file
            try:
                os.unlink(pdf_path)
            except:
                pass
                
            return pdf_doc
                
        except Exception as e:
            logger.error(f"Error loading PDF: {e}")
            raise

    async def extract_reading_content(self, pdf_id: str, cloudinary_url: str, start_page: int, end_page: int) -> str:
        """Extract raw text content from PDF pages for reading content"""
        try:
            # Load PDF
            pdf_doc = await self.load_pdf(pdf_id, cloudinary_url)
            
            # Extract text from specified pages
            text_content = ""
            for page_num in range(start_page - 1, end_page):  # Convert to 0-indexed
                if page_num < len(pdf_doc):
                    page = pdf_doc[page_num]
                    text_content += page.get_text() + "\n\n"
            
            return text_content.strip()
            
        except Exception as e:
            logger.error(f"Error extracting reading content: {e}")
            return f"Error extracting content from pages {start_page}-{end_page}: {str(e)}"

    def _extract_pages_as_pdf(self, pdf_doc: fitz.Document, start_page: int, end_page: int) -> bytes:
        # Create a new PDF document
        new_doc = fitz.open()
        
        # Convert to 0-indexed
        start_idx = start_page - 1
        end_idx = end_page - 1
        
        # Copy pages to new document
        for page_num in range(start_idx, end_idx + 1):
            if page_num < len(pdf_doc):
                new_doc.insert_pdf(pdf_doc, from_page=page_num, to_page=page_num)
        
        # Convert to bytes
        pdf_bytes = new_doc.tobytes()
        
        # Close the new document
        new_doc.close()
        
        return pdf_bytes

    def _extract_pages_as_images(self, pdf_doc: fitz.Document, start_page: int, end_page: int, zoom: float = 2.0) -> list:
        """
        Extract PDF pages as images (PNG format).
        Returns a list of base64-encoded image strings.
        """
        import base64
        
        images = []
        start_idx = start_page - 1
        end_idx = end_page - 1
        
        for page_num in range(start_idx, end_idx + 1):
            if page_num < len(pdf_doc):
                page = pdf_doc[page_num]
                # Render page to image with zoom factor for better quality
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")
                
                # Encode to base64
                img_base64 = base64.b64encode(img_bytes).decode('utf-8')
                images.append(img_base64)
        
        return images

    async def generate_content(self, pdf_id: str, cloudinary_url: str, start_page: int, end_page: int, topic: str, content_type: str) -> Dict[str, Any]:
        """
        Generate content based on type: 'read' or 'explain'
        """
        try:
            # Load PDF
            pdf_doc = await self.load_pdf(pdf_id, cloudinary_url)
            
            # Validate page range
            if start_page < 1 or end_page > len(pdf_doc) or start_page > end_page:
                return {
                    "error": f"Invalid page range. PDF has {len(pdf_doc)} pages."
                }
            
            # Extract specific pages as a new PDF
            extracted_pdf_bytes = self._extract_pages_as_pdf(pdf_doc, start_page, end_page)
            
            if not gemini_client:
                return {"error": "Gemini client not configured"}
            
            # Generate content based on type
            if content_type == "read":
                return await self._generate_read_content(extracted_pdf_bytes, start_page, end_page, topic)
            elif content_type == "explain":
                return await self._generate_explain_content(extracted_pdf_bytes, start_page, end_page, topic)
            else:
                return {"error": f"Unknown content type: {content_type}"}
                
        except Exception as e:
            logger.error(f"Error generating content: {e}")
            return {"error": f"Content generation error: {str(e)}"}

    async def _generate_read_content(self, pdf_bytes: bytes, start_page: int, end_page: int, topic: str) -> Dict[str, Any]:
        """Generate readable content from PDF pages"""
        prompt = f"""You are an excellent reader and educator. I will provide you with a PDF document containing pages {start_page} to {end_page}. 

Your task is to:
1. Carefully read and understand the content in these pages
2. Extract the readable content focused on the topic: "{topic}"
3. Present the content in a clear, readable format suitable for text-to-speech
4. Return ONLY a valid JSON object with the following format:
   {{"content": "extracted readable content in plain text format"}}

Requirements:
- Extract the main content related to the topic
- Use clear, educational language suitable for speech synthesis
- Present the content in a flowing, readable manner
- Keep the content comprehensive but well-structured
- Return ONLY the JSON object - no markdown formatting, no code blocks, no explanatory text

CRITICAL: Return ONLY valid JSON. Do not include any text before or after the JSON. Do not use markdown code blocks or any formatting.

Extract readable content about "{topic}" from the provided PDF pages."""

        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(
                        data=pdf_bytes,
                        mime_type='application/pdf',
                    ),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=4096,
                )
            )

            if hasattr(response, 'text'):
                text = response.text
                logger.info(f"Gemini read content response: {text[:200]}...")
                
                # Try to extract JSON
                try:
                    content_data = json.loads(text.strip())
                    return content_data
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code blocks
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
                    if json_match:
                        try:
                            content_data = json.loads(json_match.group(1))
                            return content_data
                        except json.JSONDecodeError:
                            pass
                    
                    # Fallback: wrap the text as content
                    return {"content": text}
            else:
                return {"error": "No response text from Gemini"}
                
        except Exception as e:
            logger.error(f"Error generating read content: {e}")
            return {"error": f"Read content generation error: {str(e)}"}

    async def _generate_explain_content(self, pdf_bytes: bytes, start_page: int, end_page: int, topic: str) -> Dict[str, Any]:
        """Generate conversational explanation content from PDF pages"""
        prompt = f"""You are an excellent tutor creating a lively conversation between two hosts about the topic: "{topic}". I will provide you with a PDF document containing pages {start_page} to {end_page}.

Your task is to:
1. Carefully read and understand the content in these pages
2. Create a lively conversation between two hosts unpacking and connecting topics from the given sources
3. One host will be the explainer (tutor with deep dive knowledge)
4. The other host will be the user itself (understanding the concept)
5. Return ONLY a valid JSON object with the following format:
   {{"content": "lively conversation between tutor and user about the topic"}}

Requirements:
- Create a natural, engaging conversation
- The tutor should explain concepts clearly and thoroughly
- The user should ask clarifying questions and show understanding
- Make it feel like a real conversation between two people
- Cover the topic comprehensively from the PDF content
- Use conversational language suitable for speech synthesis
- Return ONLY the JSON object - no markdown formatting, no code blocks, no explanatory text

CRITICAL: Return ONLY valid JSON. Do not include any text before or after the JSON. Do not use markdown code blocks or any formatting.

Create a lively conversation about "{topic}" based on the provided PDF pages."""

        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(
                        data=pdf_bytes,
                        mime_type='application/pdf',
                    ),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    temperature=0.8,
                    max_output_tokens=4096,
                )
            )

            if hasattr(response, 'text'):
                text = response.text
                logger.info(f"Gemini explain content response: {text[:200]}...")
                
                # Try to extract JSON
                try:
                    content_data = json.loads(text.strip())
                    return content_data
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code blocks
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
                    if json_match:
                        try:
                            content_data = json.loads(json_match.group(1))
                            return content_data
                        except json.JSONDecodeError:
                            pass
                    
                    # Fallback: wrap the text as content
                    return {"content": text}
            else:
                return {"error": "No response text from Gemini"}
                
        except Exception as e:
            logger.error(f"Error generating explain content: {e}")
            return {"error": f"Explain content generation error: {str(e)}"}

# Global service instance
content_service = ContentService()