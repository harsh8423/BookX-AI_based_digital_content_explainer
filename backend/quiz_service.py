import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from bson import ObjectId
from database import get_quizzes_collection, get_quiz_attempts_collection
from models import Quiz, QuizCreate, QuizResponse, QuizQuestion, QuizOption, QuizAttempt, QuizAttemptResponse, QuizResult
from content_service import content_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class QuizService:
    def __init__(self):
        pass
    
    async def generate_quiz(self, pdf_id: str, cloudinary_url: str, start_page: int, end_page: int, topic: str, section_title: str = "", subsection_title: str = "", user_id: str = "default_user", regenerate: bool = False) -> Dict[str, Any]:
        """Generate quiz from PDF content using Gemini"""
        try:
            # Load PDF and extract content
            pdf_doc = await content_service.load_pdf(pdf_id, cloudinary_url)
            
            # Validate page range
            if start_page < 1 or end_page > len(pdf_doc) or start_page > end_page:
                return {
                    "error": f"Invalid page range. PDF has {len(pdf_doc)} pages."
                }
            
            # Regenerate flag is ignored since we're not saving to database
            # if regenerate:
            #     await self._delete_existing_quizzes(pdf_id, user_id, section_title, subsection_title)
            
            # Extract specific pages as a new PDF
            extracted_pdf_bytes = content_service._extract_pages_as_pdf(pdf_doc, start_page, end_page)
            
            # Generate quiz using Gemini
            quiz_data = await self._generate_quiz_with_gemini(extracted_pdf_bytes, topic)
            
            if "error" in quiz_data:
                return quiz_data
            
            # Return quiz directly without saving to database
            return {
                "success": True,
                "quiz": {
                    "pdf_id": pdf_id,
                    "topic": topic,
                    "section_title": section_title,
                    "subsection_title": subsection_title,
                    "start_page": start_page,
                    "end_page": end_page,
                    "questions": quiz_data["questions"],
                    "created_by_user": user_id
                },
                "total_questions": len(quiz_data["questions"])
            }
            
        except Exception as e:
            logger.error(f"Error generating quiz: {e}")
            return {"error": f"Quiz generation failed: {str(e)}"}
    
    async def _delete_existing_quizzes(self, pdf_id: str, user_id: str, section_title: str, subsection_title: str):
        """Delete existing quizzes for a specific section/subsection"""
        try:
            quizzes_collection = await get_quizzes_collection()
            
            query = {
                "pdf_id": pdf_id,
                "created_by_user": user_id,
                "section_title": section_title
            }
            
            if subsection_title:
                query["subsection_title"] = subsection_title
            
            result = await quizzes_collection.delete_many(query)
            logger.info(f"Deleted {result.deleted_count} existing quizzes for section {section_title}")
            
        except Exception as e:
            logger.error(f"Error deleting existing quizzes: {e}")
    
    async def _generate_quiz_with_gemini(self, pdf_bytes: bytes, topic: str) -> Dict[str, Any]:
        """Generate quiz using Gemini AI"""
        prompt = f"""Create exactly 10 multiple choice quiz questions about "{topic}" from the PDF content.

Each question must have:
- 4 options (A, B, C, D)
- Only 1 correct answer
- Clear explanation (2-3 sentences)

Return ONLY this JSON format (no markdown, no extra text):

{{"questions":[{{"question":"What is X?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"How does Y work?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"What are Z components?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Explain process A","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Difference between B and C?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Characteristics of D?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Benefits of E?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"How is F implemented?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Types of G?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}},{{"question":"Importance of H?","options":[{{"text":"Option A","is_correct":false}},{{"text":"Option B","is_correct":true}},{{"text":"Option C","is_correct":false}},{{"text":"Option D","is_correct":false}}],"explanation":"Explanation here"}}]}}

Focus on key concepts from the PDF. Keep explanations concise but educational."""

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
                    max_output_tokens=8192,  # Increased for longer quiz responses
                )
            )

            if hasattr(response, 'text'):
                text = response.text
                logger.info(f"Gemini quiz response length: {len(text)} characters")
                logger.info(f"Gemini quiz response preview: {text[:500]}...")
                
                # Check if response seems truncated
                if not text.strip().endswith('}}'):
                    logger.warning("Response appears to be truncated - doesn't end with '}}'")
                
                # Try to extract JSON
                try:
                    quiz_data = json.loads(text.strip())
                    questions = quiz_data.get('questions', [])
                    logger.info(f"Successfully parsed JSON: {len(questions)} questions")
                    
                    # Validate that we have the expected number of questions
                    if len(questions) < 10:
                        logger.warning(f"Only got {len(questions)} questions, expected 10")
                    
                    return quiz_data
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    # Try to extract JSON from markdown code blocks
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
                    if json_match:
                        try:
                            quiz_data = json.loads(json_match.group(1))
                            logger.info(f"Successfully parsed JSON from code block: {len(quiz_data.get('questions', []))} questions")
                            return quiz_data
                        except json.JSONDecodeError as e2:
                            logger.error(f"JSON decode error from code block: {e2}")
                    
                    # Try to find JSON object without code blocks
                    json_match = re.search(r'\{.*\}', text, re.DOTALL)
                    if json_match:
                        try:
                            quiz_data = json.loads(json_match.group(0))
                            logger.info(f"Successfully parsed JSON from regex: {len(quiz_data.get('questions', []))} questions")
                            return quiz_data
                        except json.JSONDecodeError as e3:
                            logger.error(f"JSON decode error from regex: {e3}")
                    
                    logger.error(f"Failed to parse any JSON from response: {text[:1000]}")
                    
                    # Try to extract partial questions if response was truncated
                    try:
                        # Look for complete questions in the truncated response
                        import re
                        question_pattern = r'"question":\s*"([^"]+)"'
                        questions_found = re.findall(question_pattern, text)
                        
                        if len(questions_found) >= 5:  # If we have at least 5 questions
                            logger.info(f"Found {len(questions_found)} questions in truncated response")
                            return {"error": f"Response truncated. Found {len(questions_found)} questions but JSON is incomplete. Please try again with a shorter topic or fewer questions."}
                        else:
                            return {"error": "Failed to parse quiz from Gemini response"}
                    except Exception as e:
                        logger.error(f"Error in fallback parsing: {e}")
                        return {"error": "Failed to parse quiz from Gemini response"}
            else:
                return {"error": "No response text from Gemini"}
                
        except Exception as e:
            logger.error(f"Error generating quiz with Gemini: {e}")
            return {"error": f"Quiz generation error: {str(e)}"}
    
    async def create_quiz(self, quiz_data: QuizCreate) -> QuizResponse:
        """Create a new quiz"""
        try:
            quizzes_collection = await get_quizzes_collection()
            
            # Convert to Quiz model with explicit timestamps
            quiz_dict = quiz_data.dict()
            quiz_dict['created_at'] = datetime.utcnow()
            quiz_dict['updated_at'] = datetime.utcnow()
            
            quiz = Quiz(**quiz_dict)
            
            # Insert into database
            result = await quizzes_collection.insert_one(quiz.dict(by_alias=True))
            
            # Fetch the created quiz
            created_quiz = await quizzes_collection.find_one({"_id": result.inserted_id})
            
            return self._convert_to_response(created_quiz)
            
        except Exception as e:
            logger.error(f"Error creating quiz: {e}")
            raise
    
    async def get_quizzes_by_pdf(self, pdf_id: str, user_id: str) -> List[QuizResponse]:
        """Get all quizzes for a specific PDF and user (returns empty list since quizzes are not saved)"""
        try:
            # Return empty list since we're not saving quizzes to database
            return []
            
        except Exception as e:
            logger.error(f"Error getting quizzes by PDF: {e}")
            raise
    
    async def get_quiz(self, quiz_id: str, user_id: str) -> Optional[QuizResponse]:
        """Get a specific quiz"""
        try:
            quizzes_collection = await get_quizzes_collection()
            
            quiz = await quizzes_collection.find_one({
                "_id": ObjectId(quiz_id),
                "created_by_user": user_id
            })
            
            if quiz:
                return self._convert_to_response(quiz)
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting quiz: {e}")
            raise
    
    async def submit_quiz_attempt(self, quiz_id: str, user_id: str, results: List[QuizResult], completion_time: float) -> QuizAttemptResponse:
        """Submit a quiz attempt without saving to database"""
        try:
            # Calculate total score
            total_score = sum(1 for result in results if result.is_correct)
            total_questions = len(results)
            
            # Return attempt response without saving to database
            from datetime import datetime
            return QuizAttemptResponse(
                id="",  # No database ID since we're not saving
                quiz_id=quiz_id,
                user_id=user_id,
                results=results,
                total_score=total_score,
                total_questions=total_questions,
                completion_time=completion_time,
                created_at=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error submitting quiz attempt: {e}")
            raise
    
    async def get_quiz_attempts(self, quiz_id: str, user_id: str) -> List[QuizAttemptResponse]:
        """Get all quiz attempts for a specific quiz and user (returns empty list since attempts are not saved)"""
        try:
            # Return empty list since we're not saving attempts to database
            return []
            
        except Exception as e:
            logger.error(f"Error getting quiz attempts: {e}")
            raise
    
    async def delete_quiz(self, quiz_id: str, user_id: str) -> bool:
        """Delete a quiz"""
        try:
            quizzes_collection = await get_quizzes_collection()
            
            result = await quizzes_collection.delete_one({
                "_id": ObjectId(quiz_id),
                "created_by_user": user_id
            })
            
            return result.deleted_count > 0
            
        except Exception as e:
            logger.error(f"Error deleting quiz: {e}")
            raise
    
    def _convert_to_response(self, quiz_dict: Dict[str, Any]) -> QuizResponse:
        """Convert database document to QuizResponse"""
        from datetime import datetime
        
        return QuizResponse(
            id=str(quiz_dict["_id"]),
            pdf_id=quiz_dict["pdf_id"],
            topic=quiz_dict["topic"],
            section_title=quiz_dict.get("section_title"),
            subsection_title=quiz_dict.get("subsection_title"),
            start_page=quiz_dict["start_page"],
            end_page=quiz_dict["end_page"],
            questions=[QuizQuestion(**q) for q in quiz_dict["questions"]],
            created_by_user=quiz_dict["created_by_user"],
            created_at=quiz_dict.get("created_at", datetime.utcnow()),
            updated_at=quiz_dict.get("updated_at", datetime.utcnow())
        )
    
    def _convert_attempt_to_response(self, attempt_dict: Dict[str, Any]) -> QuizAttemptResponse:
        """Convert database document to QuizAttemptResponse"""
        from datetime import datetime
        
        return QuizAttemptResponse(
            id=str(attempt_dict["_id"]),
            quiz_id=attempt_dict["quiz_id"],
            user_id=attempt_dict["user_id"],
            results=[QuizResult(**r) for r in attempt_dict["results"]],
            total_score=attempt_dict["total_score"],
            total_questions=attempt_dict["total_questions"],
            completion_time=attempt_dict["completion_time"],
            created_at=attempt_dict.get("created_at", datetime.utcnow())
        )

# Global service instance
quiz_service = QuizService()