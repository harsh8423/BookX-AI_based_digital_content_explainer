"""
Explanation Service
Handles HTTP-based explanation generation with MongoDB caching
"""

import logging
import base64
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from bson import ObjectId

from models import ExplanationRequest, ExplanationResponse, QARequest, QAResponse, PDFChatRequest, PDFChatResponse
from database import get_explanations_collection, get_pdfs_collection
from auth import get_current_user, User
from content_service import content_service
from gemini_service import client as gemini_client
from gemini_tts_service import gemini_tts_service
from groq import Groq
import os

# Groq setup for Q&A
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

explanation_router = APIRouter()


def generate_unique_key(pdf_id: str, topic: str, start_page: int, end_page: int) -> str:
    """Generate unique key for explanation cache"""
    # Sanitize topic to remove special characters
    sanitized_topic = "".join(c if c.isalnum() else "_" for c in topic)
    return f"{pdf_id}_{sanitized_topic}_{start_page}_{end_page}"


@explanation_router.post("/{pdf_id}/explain", response_model=ExplanationResponse)
async def generate_explanation(
    pdf_id: str,
    request: ExplanationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate or retrieve cached explanation with audio.
    
    Flow:
    1. Check MongoDB cache for existing explanation
    2. If exists, return cached text + audio URL immediately
    3. If not exists:
       - Extract reading content from PDF pages
       - Generate explanation text with Gemini
       - Generate audio with Gemini TTS
       - Upload audio to Cloudinary
       - Save to MongoDB cache
       - Return text content + Cloudinary audio URL
    """
    try:
        # Validate PDF ownership
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        # Generate unique key for caching
        unique_key = generate_unique_key(pdf_id, request.topic, request.start_page, request.end_page)
        logger.info(f"Looking for cached explanation with key: {unique_key}")
        
        # Check cache
        explanations_collection = await get_explanations_collection()
        cached_explanation = await explanations_collection.find_one({"unique_key": unique_key})
        
        if cached_explanation:
            logger.info(f"Found cached explanation for key: {unique_key}")
            return ExplanationResponse(
                text_content=cached_explanation["text_content"],
                audio_url=cached_explanation["audio_url"],
                topic=cached_explanation["topic"],
                start_page=cached_explanation["start_page"],
                end_page=cached_explanation["end_page"],
                cached=True
            )
        
        logger.info(f"No cached explanation found. Generating new explanation...")
        
        # Load PDF and extract pages as PDF bytes
        logger.info(f"Loading PDF and extracting pages {request.start_page} to {request.end_page}...")
        try:
            pdf_doc_obj = await content_service.load_pdf(pdf_id, pdf_doc["cloudinary_url"])
            
            # Validate page range
            if request.start_page < 1 or request.end_page > len(pdf_doc_obj) or request.start_page > request.end_page:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid page range. PDF has {len(pdf_doc_obj)} pages."
                )
            
            # Extract pages as PDF bytes
            pdf_bytes = content_service._extract_pages_as_pdf(pdf_doc_obj, request.start_page, request.end_page)
            logger.info(f"Extracted PDF bytes: {len(pdf_bytes)} bytes")
        except HTTPException:
            raise
        except Exception as extract_error:
            logger.error(f"PDF extraction error: {extract_error}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to extract PDF pages: {str(extract_error)}"
            )
        
        # Generate explanation text with simplified prompt
        explanation_prompt = f"""You are a normal teacher explaining this topic to a student. Be clear, engaging, and educational.

Topic: {request.topic}

Please provide a CONCISE explanation of the content from pages {request.start_page} to {request.end_page} of this PDF document. 

IMPORTANT:
- Keep the explanation brief and focused (maximum 300-400 words)
- Cover only the key concepts and main points
- Use simple, clear language
- Make it suitable for text-to-speech (will be read aloud)
- Be direct and to the point
NOTE: Do not include any other text in your response. Only the explanation IN Plain Text.
Note: Don't give long explanations. Keep it concise and in the plain text format.
Provide the explanation now:"""

        # Use Gemini to generate explanation text with PDF
        if not gemini_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Gemini client not configured"
            )
        
        logger.info("Calling Gemini API with PDF to generate explanation text...")
        try:
            from google.genai import types
            
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(
                        data=pdf_bytes,
                        mime_type='application/pdf',
                    ),
                    explanation_prompt
                ],
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=2000,  # Limit to ~600 words for concise explanation
                )
            )
            
            explanation_text = getattr(response, "text", None) or str(response)
            logger.info(f"Generated explanation text (length: {len(explanation_text)})")
            
            if not explanation_text:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to generate explanation text"
                )
        except Exception as gemini_error:
            logger.error(f"Gemini API error: {gemini_error}", exc_info=True)
            raise
        
        # Generate audio and upload to Cloudinary
        # Sanitize filename to remove special characters
        safe_topic = "".join(c if c.isalnum() else "_" for c in request.topic)
        filename = f"{pdf_id}_{safe_topic}_{request.start_page}_{request.end_page}"
        logger.info(f"Generating audio with filename: {filename}")
        
        try:
            audio_result = await gemini_tts_service.generate_and_upload_explanation_audio(
                explanation_text,
                request.topic,
                filename
            )
        except Exception as audio_error:
            logger.error(f"Audio generation error: {audio_error}", exc_info=True)
            raise
        
        if not audio_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate audio: {audio_result.get('error', 'Unknown error')}"
            )
        
        audio_url = audio_result.get("audio_url")
        
        # Save to MongoDB cache
        cache_document = {
            "unique_key": unique_key,
            "pdf_id": pdf_id,
            "topic": request.topic,
            "start_page": request.start_page,
            "end_page": request.end_page,
            "text_content": explanation_text,
            "audio_url": audio_url,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await explanations_collection.insert_one(cache_document)
        logger.info(f"Cached explanation with key: {unique_key}")
        
        return ExplanationResponse(
            text_content=explanation_text,
            audio_url=audio_url,
            topic=request.topic,
            start_page=request.start_page,
            end_page=request.end_page,
            cached=False
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error generating explanation: {e}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate explanation: {str(e)}"
        )


@explanation_router.post("/{pdf_id}/qa", response_model=QAResponse)
async def handle_qa(
    pdf_id: str,
    request: QARequest,
    current_user: User = Depends(get_current_user)
):
    """
    Handle Q&A question and return audio response.
    
    Flow:
    1. Receive question text
    2. Use Groq chat to generate answer with explanation context
    3. Generate audio response using Minimax/Gemini TTS
    4. Return answer text + base64 encoded audio
    """
    try:
        # Validate PDF ownership
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        if not groq_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Groq client not configured"
            )
        
        logger.info(f"Processing Q&A question for PDF {pdf_id}")
        logger.info(f"Question: {request.question[:100]}...")
        
        # Build context for Groq chat
        enhanced_context = [
            {
                "role": "system",
                "content": f"""You are a knowledgeable tutor explaining the topic: "{request.topic}". 
                
Current explanation content: "{request.explanation_text}"

When the student asks a question:
1. Answer clearly and helpfully based on the explanation content
2. Keep responses concise but informative
3. After answering, add: "I hope your doubts are clear now. Let's move back to the topic."
4. Use "I" when referring to yourself as the tutor
5. Address the student directly with "you"

Note: Do not include any other text in your response. Only the answer in plain text.
Note: Don't give long answers. Keep it concise and in the plain text format.
Remember: You are the tutor helping the student understand the material."""
            },
            {
                "role": "user",
                "content": request.question
            }
        ]
        
        # Generate tutor response with Groq
        logger.info("Generating tutor response with Groq...")
        response = groq_client.chat.completions.create(
            model=GROQ_CHAT_MODEL,
            messages=enhanced_context,
            stream=False,
            temperature=0.7,
            max_tokens=500
        )
        
        answer_text = response.choices[0].message.content
        logger.info(f"Generated answer (length: {len(answer_text)})")
        
        # Generate audio response
        logger.info("Generating audio response...")
        audio_chunks = []
        used_minimax = False
        
        # Try Minimax first
        try:
            from gemini_tts_service import MINIMAX_API_KEY, generate_minimax_audio_async
        except ImportError:
            MINIMAX_API_KEY = None
            generate_minimax_audio_async = None
        
        if MINIMAX_API_KEY and generate_minimax_audio_async:
            try:
                logger.info("Using Minimax for Q&A audio...")
                async for chunk in generate_minimax_audio_async(answer_text):
                    audio_chunks.append(chunk)
                used_minimax = True
                audio_format = "mp3"
            except Exception as minimax_error:
                logger.warning(f"Minimax failed: {minimax_error}. Using Gemini...")
                audio_chunks = []
        
        # Fallback to Gemini
        if not used_minimax:
            logger.info("Using Gemini TTS for Q&A audio...")
            async for chunk in gemini_tts_service.generate_tutor_response_audio(answer_text):
                audio_chunks.append(chunk)
            audio_format = "wav"
        
        # Combine audio chunks
        full_audio_data = b''.join(audio_chunks)
        logger.info(f"Generated audio: {len(full_audio_data)} bytes, format: {audio_format}")
        
        # Encode audio as base64
        audio_base64 = base64.b64encode(full_audio_data).decode('utf-8')
        
        return QAResponse(
            question_text=None,  # Text Q&A doesn't have transcribed question
            answer_text=answer_text,
            audio_base64=audio_base64,
            audio_format=audio_format
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error handling Q&A: {e}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process Q&A: {str(e)}"
        )


@explanation_router.post("/{pdf_id}/qa/audio")
async def handle_qa_with_audio(
    pdf_id: str,
    audio_file: UploadFile = File(...),
    explanation_text: str = Form(...),
    topic: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """
    Handle Q&A with audio input (speech-to-text).
    Accepts audio file, converts to text, then processes as Q&A.
    """
    try:
        # Validate PDF ownership
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        if not groq_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Groq client not configured"
            )
        
        # Read audio file
        audio_data = await audio_file.read()
        logger.info(f"Received audio file: {len(audio_data)} bytes")
        
        # Save to temp file for Groq STT
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
        
        try:
            # Convert speech to text using Groq Whisper
            logger.info("Converting speech to text with Groq...")
            with open(temp_file_path, 'rb') as audio_file_obj:
                transcription = groq_client.audio.transcriptions.create(
                    model=GROQ_STT_MODEL,
                    file=audio_file_obj
                )
            
            question_text = transcription.text
            logger.info(f"Transcribed question: {question_text}")
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_file_path):
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
        
        # Process as regular Q&A
        qa_request = QARequest(
            question=question_text,
            explanation_text=explanation_text or "",
            topic=topic or ""
        )
        
        # Get the Q&A response
        qa_response = await handle_qa(pdf_id, qa_request, current_user)
        
        # Add the transcribed question to the response
        qa_response.question_text = question_text
        
        return qa_response
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error handling Q&A with audio: {e}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process Q&A with audio: {str(e)}"
        )


@explanation_router.post("/{pdf_id}/chat", response_model=PDFChatResponse)
async def chat_with_pdf(
    pdf_id: str,
    request: PDFChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Chat with PDF - send query with PDF pages as context to Gemini.
    """
    try:
        # Validate PDF ownership
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        if not gemini_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Gemini client not configured"
            )
        
        logger.info(f"Processing chat query for PDF {pdf_id}, pages {request.start_page}-{request.end_page}")
        logger.info(f"Query: {request.query[:100]}...")
        
        # Get PDF cloudinary URL
        cloudinary_url = pdf_doc.get('cloudinary_url')
        if not cloudinary_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF cloudinary URL not found"
            )
        
        # Extract PDF pages as bytes
        pdf_doc_obj = await content_service.load_pdf(pdf_id, cloudinary_url)
        extracted_pdf_bytes = content_service._extract_pages_as_pdf(
            pdf_doc_obj, 
            request.start_page, 
            request.end_page
        )
        
        logger.info(f"Extracted PDF pages: {len(extracted_pdf_bytes)} bytes")
        
        # Prepare prompt for Gemini
        prompt = f"""You are a helpful assistant answering questions with a reference for your context and knowledge.


User's question: {request.query}

Please provide a clear answer. If the question is not related to study, factual question please denny the question and say that you are not able to answer that question.

Answer:"""
        
        # Send to Gemini with PDF
        logger.info("Sending query to Gemini with PDF context...")
        from google.genai import types
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                types.Part.from_bytes(
                    data=extracted_pdf_bytes,
                    mime_type="application/pdf"
                ),
                prompt
            ],
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=2000
            )
        )
        
        answer = getattr(response, "text", None) or str(response)
        logger.info(f"Generated answer (length: {len(answer)})")
        
        return PDFChatResponse(answer=answer)
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error in PDF chat: {e}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process chat query: {str(e)}"
        )
