import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from bson import ObjectId
from database import get_flashcards_collection
from models import FlashcardSet, FlashcardSetCreate, FlashcardSetResponse, FlashcardItem
from content_service import content_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FlashcardService:
    def __init__(self):
        pass
    
    async def generate_flashcards(self, pdf_id: str, cloudinary_url: str, start_page: int, end_page: int, topic: str, section_title: str = "", subsection_title: str = "", user_id: str = "default_user", regenerate: bool = False) -> Dict[str, Any]:
        """Generate flashcards from PDF content using Gemini"""
        try:
            # Load PDF and extract content
            pdf_doc = await content_service.load_pdf(pdf_id, cloudinary_url)
            
            # Validate page range
            if start_page < 1 or end_page > len(pdf_doc) or start_page > end_page:
                return {
                    "error": f"Invalid page range. PDF has {len(pdf_doc)} pages."
                }
            
            # If regenerating, delete existing flashcards for this section
            if regenerate:
                await self._delete_existing_flashcards(pdf_id, user_id, section_title, subsection_title)
            
            # Extract specific pages as a new PDF
            extracted_pdf_bytes = content_service._extract_pages_as_pdf(pdf_doc, start_page, end_page)
            
            # Generate flashcards using Gemini
            flashcards_data = await self._generate_flashcards_with_gemini(extracted_pdf_bytes, topic)
            
            if "error" in flashcards_data:
                return flashcards_data
            
            # Create flashcard set
            flashcard_set = FlashcardSetCreate(
                pdf_id=pdf_id,
                topic=topic,
                section_title=section_title,
                subsection_title=subsection_title,
                start_page=start_page,
                end_page=end_page,
                flashcards=flashcards_data["flashcards"],
                created_by_user=user_id
            )
            
            # Save to database
            saved_flashcards = await self.create_flashcard_set(flashcard_set)
            
            return {
                "success": True,
                "flashcards": saved_flashcards,
                "total_flashcards": len(flashcards_data["flashcards"])
            }
            
        except Exception as e:
            logger.error(f"Error generating flashcards: {e}")
            return {"error": f"Flashcard generation failed: {str(e)}"}
    
    async def _delete_existing_flashcards(self, pdf_id: str, user_id: str, section_title: str, subsection_title: str):
        """Delete existing flashcards for a specific section/subsection"""
        try:
            flashcards_collection = await get_flashcards_collection()
            
            query = {
                "pdf_id": pdf_id,
                "created_by_user": user_id,
                "section_title": section_title
            }
            
            if subsection_title:
                query["subsection_title"] = subsection_title
            
            result = await flashcards_collection.delete_many(query)
            logger.info(f"Deleted {result.deleted_count} existing flashcards for section {section_title}")
            
        except Exception as e:
            logger.error(f"Error deleting existing flashcards: {e}")
    
    async def _generate_flashcards_with_gemini(self, pdf_bytes: bytes, topic: str) -> Dict[str, Any]:
        """Generate flashcards using Gemini AI"""
        prompt = f"""You are an excellent educator creating flashcards for the topic: "{topic}". I will provide you with a PDF document.

Your task is to:
1. Carefully read and understand the content in the PDF
2. Create exactly 10 high-quality flashcards focused on the topic: "{topic}"
3. Each flashcard should have a clear question and a comprehensive answer
4. Return ONLY a valid JSON object with the following EXACT format:

{{"flashcards":[{{"question":"What is the definition of X?","answer":"X is defined as..."}},{{"question":"How does Y work?","answer":"Y works by..."}},{{"question":"What are the main components of Z?","answer":"The main components of Z are..."}},{{"question":"Explain the process of A","answer":"The process of A involves..."}},{{"question":"What is the difference between B and C?","answer":"The difference between B and C is..."}},{{"question":"Describe the characteristics of D","answer":"The characteristics of D include..."}},{{"question":"What are the benefits of E?","answer":"The benefits of E are..."}},{{"question":"How is F implemented?","answer":"F is implemented by..."}},{{"question":"What are the types of G?","answer":"The types of G are..."}},{{"question":"Explain the importance of H","answer":"The importance of H is..."}}]}}

Requirements:
- Create exactly 10 flashcards
- Questions should be clear and test understanding
- Answers should be comprehensive and educational (at least 2-3 sentences)
- Focus on key concepts, definitions, and important details from the PDF
- Make flashcards suitable for active recall practice
- Use proper JSON escaping for quotes and special characters
- Return ONLY the JSON object - no markdown, no code blocks, no explanatory text

CRITICAL: Return ONLY valid JSON starting with {{ and ending with }}. No other text before or after."""

        try:
            from google import genai
            from google.genai import types
            
            GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not GEMINI_API_KEY:
                return {"error": "Gemini API key not configured"}
            
            gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            
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
                logger.info(f"Gemini flashcard response: {text[:500]}...")
                
                # Try to extract JSON
                try:
                    flashcards_data = json.loads(text.strip())
                    logger.info(f"Successfully parsed JSON: {len(flashcards_data.get('flashcards', []))} flashcards")
                    return flashcards_data
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    # Try to extract JSON from markdown code blocks
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
                    if json_match:
                        try:
                            flashcards_data = json.loads(json_match.group(1))
                            logger.info(f"Successfully parsed JSON from code block: {len(flashcards_data.get('flashcards', []))} flashcards")
                            return flashcards_data
                        except json.JSONDecodeError as e2:
                            logger.error(f"JSON decode error from code block: {e2}")
                    
                    # Try to find JSON object without code blocks
                    json_match = re.search(r'\{.*\}', text, re.DOTALL)
                    if json_match:
                        try:
                            flashcards_data = json.loads(json_match.group(0))
                            logger.info(f"Successfully parsed JSON from regex: {len(flashcards_data.get('flashcards', []))} flashcards")
                            return flashcards_data
                        except json.JSONDecodeError as e3:
                            logger.error(f"JSON decode error from regex: {e3}")
                    
                    logger.error(f"Failed to parse any JSON from response: {text[:1000]}")
                    return {"error": "Failed to parse flashcards from Gemini response"}
            else:
                return {"error": "No response text from Gemini"}
                
        except Exception as e:
            logger.error(f"Error generating flashcards with Gemini: {e}")
            return {"error": f"Flashcard generation error: {str(e)}"}
    
    async def create_flashcard_set(self, flashcard_data: FlashcardSetCreate) -> FlashcardSetResponse:
        """Create a new flashcard set"""
        try:
            flashcards_collection = await get_flashcards_collection()
            
            # Convert to FlashcardSet model with explicit timestamps
            flashcard_dict = flashcard_data.dict()
            flashcard_dict['created_at'] = datetime.utcnow()
            flashcard_dict['updated_at'] = datetime.utcnow()
            
            flashcard_set = FlashcardSet(**flashcard_dict)
            
            # Insert into database
            result = await flashcards_collection.insert_one(flashcard_set.dict(by_alias=True))
            
            # Fetch the created flashcard set
            created_flashcards = await flashcards_collection.find_one({"_id": result.inserted_id})
            
            return self._convert_to_response(created_flashcards)
            
        except Exception as e:
            logger.error(f"Error creating flashcard set: {e}")
            raise
    
    async def get_flashcards_by_pdf(self, pdf_id: str, user_id: str) -> List[FlashcardSetResponse]:
        """Get all flashcard sets for a specific PDF and user"""
        try:
            flashcards_collection = await get_flashcards_collection()
            
            cursor = flashcards_collection.find({
                "pdf_id": pdf_id,
                "created_by_user": user_id
            }).sort("created_at", -1)
            
            flashcards = []
            async for flashcard_set in cursor:
                flashcards.append(self._convert_to_response(flashcard_set))
            
            return flashcards
            
        except Exception as e:
            logger.error(f"Error getting flashcards by PDF: {e}")
            raise
    
    async def get_flashcard_set(self, flashcard_id: str, user_id: str) -> Optional[FlashcardSetResponse]:
        """Get a specific flashcard set"""
        try:
            flashcards_collection = await get_flashcards_collection()
            
            flashcard_set = await flashcards_collection.find_one({
                "_id": ObjectId(flashcard_id),
                "created_by_user": user_id
            })
            
            if flashcard_set:
                return self._convert_to_response(flashcard_set)
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting flashcard set: {e}")
            raise
    
    async def delete_flashcard_set(self, flashcard_id: str, user_id: str) -> bool:
        """Delete a flashcard set"""
        try:
            flashcards_collection = await get_flashcards_collection()
            
            result = await flashcards_collection.delete_one({
                "_id": ObjectId(flashcard_id),
                "created_by_user": user_id
            })
            
            return result.deleted_count > 0
            
        except Exception as e:
            logger.error(f"Error deleting flashcard set: {e}")
            raise
    
    def _convert_to_response(self, flashcard_dict: Dict[str, Any]) -> FlashcardSetResponse:
        """Convert database document to FlashcardSetResponse"""
        from datetime import datetime
        
        return FlashcardSetResponse(
            id=str(flashcard_dict["_id"]),
            pdf_id=flashcard_dict["pdf_id"],
            topic=flashcard_dict["topic"],
            section_title=flashcard_dict.get("section_title"),
            subsection_title=flashcard_dict.get("subsection_title"),
            start_page=flashcard_dict["start_page"],
            end_page=flashcard_dict["end_page"],
            flashcards=[FlashcardItem(**card) for card in flashcard_dict["flashcards"]],
            created_by_user=flashcard_dict["created_by_user"],
            created_at=flashcard_dict.get("created_at", datetime.utcnow()),
            updated_at=flashcard_dict.get("updated_at", datetime.utcnow())
        )

# Global service instance
flashcard_service = FlashcardService()