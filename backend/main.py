"""
BookX Backend API
FastAPI application for PDF management with AI analysis
"""

# Standard library imports
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import List

# Third-party imports
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

# Local imports
from auth import auth_router
from content_service import content_service
from database import get_database
from explain_websocket_service import explain_websocket_service
from explanation_service import explanation_router
from flashcard_service import flashcard_service
from models import (
    ContentRequest,
    FlashcardRequest,
    FlashcardSetResponse,
    QuizAttemptResponse,
    QuizRequest,
    QuizResponse,
)
from pdfs import pdf_router
from quiz_service import quiz_service

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown tasks"""
    # Startup
    logger.info("Starting BookX API server...")
    try:
        # Test database connection by getting database and pinging
        db = await get_database()
        # Use the database's client to ping
        from database import client as db_client
        if db_client:
            await db_client.admin.command('ping')
            logger.info("Database connection established successfully")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down BookX API server...")

app = FastAPI(
    title="BookX API",
    description="PDF Management API with AI Analysis",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/auth", tags=["authentication"])
app.include_router(pdf_router, prefix="/pdfs", tags=["pdfs"])
app.include_router(explanation_router, prefix="/api/pdfs", tags=["explanations"])

@app.get("/")
async def root():
    return {"message": "BookX API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/pdfs/{pdf_id}/content")
async def generate_content(pdf_id: str, request: ContentRequest):
    """
    Generate content (read or explain) for specific PDF pages.
    
    Args:
        pdf_id: The ID of the PDF document
        request: ContentRequest with page range, topic, and content type
        
    Returns:
        Generated content with optional note information
    """
    try:
        # Validate PDF ID format
        if not ObjectId.is_valid(pdf_id):
            raise HTTPException(status_code=400, detail="Invalid PDF ID format")
        
        # Get PDF details from database
        db = await get_database()
        pdf_collection = db["pdfs"]
        pdf_doc = await pdf_collection.find_one({"_id": ObjectId(pdf_id)})
        
        if not pdf_doc:
            raise HTTPException(status_code=404, detail="PDF not found")
        
        logger.info(f"Generating {request.type} content for PDF {pdf_id}, pages {request.start_page}-{request.end_page}")
        
        # Generate content using the content service
        result = await content_service.generate_content(
            pdf_id=pdf_id,
            cloudinary_url=pdf_doc["cloudinary_url"],
            start_page=request.start_page,
            end_page=request.end_page,
            topic=request.topic,
            content_type=request.type
        )
        
        if "error" in result:
            logger.error(f"Content generation error: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Content generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

# Flashcard endpoints
@app.post("/pdfs/{pdf_id}/flashcards")
async def generate_flashcards(pdf_id: str, request: FlashcardRequest):
    """Generate flashcards for specific PDF pages"""
    try:
        if not ObjectId.is_valid(pdf_id):
            raise HTTPException(status_code=400, detail="Invalid PDF ID format")
        
        logger.info(f"Flashcard request received for PDF {pdf_id}: pages {request.start_page}-{request.end_page}")
        
        # Get PDF details from database
        db = await get_database()
        pdf_collection = db["pdfs"]
        pdf_doc = await pdf_collection.find_one({"_id": ObjectId(pdf_id)})
        
        if not pdf_doc:
            raise HTTPException(status_code=404, detail="PDF not found")
        
        # Generate flashcards using the flashcard service
        result = await flashcard_service.generate_flashcards(
            pdf_id=pdf_id,
            cloudinary_url=pdf_doc["cloudinary_url"],
            start_page=request.start_page,
            end_page=request.end_page,
            topic=request.topic,
            section_title=request.section_title or "",
            subsection_title=request.subsection_title or "",
            user_id="default_user",
            regenerate=request.regenerate
        )
        
        if "error" in result:
            logger.error(f"Flashcard generation error: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Flashcard generation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Flashcard generation failed: {str(e)}")

@app.get("/pdfs/{pdf_id}/flashcards", response_model=List[FlashcardSetResponse])
async def get_pdf_flashcards(pdf_id: str, user_id: str = "default_user"):
    """Get all flashcard sets for a specific PDF"""
    try:
        flashcards = await flashcard_service.get_flashcards_by_pdf(pdf_id, user_id)
        return flashcards
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get flashcards: {str(e)}")

@app.get("/flashcards/{flashcard_id}", response_model=FlashcardSetResponse)
async def get_flashcard_set(flashcard_id: str, user_id: str = "default_user"):
    """Get a specific flashcard set"""
    try:
        flashcard_set = await flashcard_service.get_flashcard_set(flashcard_id, user_id)
        if not flashcard_set:
            raise HTTPException(status_code=404, detail="Flashcard set not found")
        return flashcard_set
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get flashcard set: {str(e)}")

@app.delete("/flashcards/{flashcard_id}")
async def delete_flashcard_set(flashcard_id: str, user_id: str = "default_user"):
    """Delete a specific flashcard set"""
    try:
        success = await flashcard_service.delete_flashcard_set(flashcard_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Flashcard set not found")
        return {"message": "Flashcard set deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete flashcard set: {str(e)}")

# Quiz endpoints
@app.post("/pdfs/{pdf_id}/quizzes")
async def generate_quiz(pdf_id: str, request: QuizRequest):
    """Generate quiz for specific PDF pages"""
    try:
        if not ObjectId.is_valid(pdf_id):
            raise HTTPException(status_code=400, detail="Invalid PDF ID format")
        
        logger.info(f"Quiz request received for PDF {pdf_id}: pages {request.start_page}-{request.end_page}")
        
        # Get PDF details from database
        db = await get_database()
        pdf_collection = db["pdfs"]
        pdf_doc = await pdf_collection.find_one({"_id": ObjectId(pdf_id)})
        
        if not pdf_doc:
            raise HTTPException(status_code=404, detail="PDF not found")
        
        # Generate quiz using the quiz service
        result = await quiz_service.generate_quiz(
            pdf_id=pdf_id,
            cloudinary_url=pdf_doc["cloudinary_url"],
            start_page=request.start_page,
            end_page=request.end_page,
            topic=request.topic,
            section_title=request.section_title or "",
            subsection_title=request.subsection_title or "",
            user_id="default_user",
            regenerate=request.regenerate
        )
        
        if "error" in result:
            logger.error(f"Quiz generation error: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quiz generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")

@app.get("/pdfs/{pdf_id}/quizzes", response_model=List[QuizResponse])
async def get_pdf_quizzes(pdf_id: str, user_id: str = "default_user"):
    """Get all quizzes for a specific PDF"""
    try:
        quizzes = await quiz_service.get_quizzes_by_pdf(pdf_id, user_id)
        return quizzes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get quizzes: {str(e)}")

@app.get("/quizzes/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: str, user_id: str = "default_user"):
    """Get a specific quiz"""
    try:
        quiz = await quiz_service.get_quiz(quiz_id, user_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return quiz
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get quiz: {str(e)}")

@app.post("/quizzes/{quiz_id}/submit")
async def submit_quiz_attempt(quiz_id: str, attempt_data: dict, user_id: str = "default_user"):
    """Submit a quiz attempt"""
    try:
        from models import QuizResult
        
        # Convert attempt data to QuizResult objects
        results = []
        for result_data in attempt_data.get("results", []):
            results.append(QuizResult(**result_data))
        
        completion_time = attempt_data.get("completion_time", 0.0)
        
        # Submit the attempt
        attempt = await quiz_service.submit_quiz_attempt(
            quiz_id=quiz_id,
            user_id=user_id,
            results=results,
            completion_time=completion_time
        )
        
        return attempt
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit quiz attempt: {str(e)}")

@app.get("/quizzes/{quiz_id}/attempts", response_model=List[QuizAttemptResponse])
async def get_quiz_attempts(quiz_id: str, user_id: str = "default_user"):
    """Get all quiz attempts for a specific quiz"""
    try:
        attempts = await quiz_service.get_quiz_attempts(quiz_id, user_id)
        return attempts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get quiz attempts: {str(e)}")

@app.delete("/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: str, user_id: str = "default_user"):
    """Delete a specific quiz"""
    try:
        success = await quiz_service.delete_quiz(quiz_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return {"message": "Quiz deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete quiz: {str(e)}")

@app.websocket("/ws/explain/{pdf_id}")
async def websocket_explain_mode(websocket: WebSocket, pdf_id: str):
    """WebSocket endpoint for interactive explain mode"""
    logger.info(f"WebSocket explain connection established for PDF: {pdf_id}")
    await explain_websocket_service.connect(websocket, pdf_id, "default_user")
    
    try:
        # Handle messages
        while True:
            try:
                data = await websocket.receive()
                logger.debug(f"Received WebSocket explain data: {data['type']}")
                
                if data["type"] == "websocket.receive":
                    if "bytes" in data:
                        # Handle binary audio data
                        audio_data = data["bytes"]
                        logger.debug(f"Processing audio data: {len(audio_data)} bytes")
                        await explain_websocket_service.process_audio_input(pdf_id, audio_data)
                    elif "text" in data:
                        # Handle text messages
                        message_data = json.loads(data["text"])
                        logger.debug(f"Processing text message: {message_data.get('type')}")
                        
                        if message_data.get("type") == "start_explanation":
                            content = message_data.get("content", "")
                            topic = message_data.get("topic", "")
                            section_title = message_data.get("section_title", "")
                            subsection_title = message_data.get("subsection_title", "")
                            start_page = message_data.get("start_page", 0)
                            end_page = message_data.get("end_page", 0)
                            user_id = message_data.get("user_id", "default_user")
                            reading_content = message_data.get("reading_content", content)
                            await explain_websocket_service.start_explanation(
                                pdf_id, content, topic, section_title, subsection_title, start_page, end_page, reading_content
                            )
                        elif message_data.get("type") == "pause_explanation":
                            await explain_websocket_service.pause_explanation(pdf_id)
                        elif message_data.get("type") == "resume_explanation":
                            await explain_websocket_service.resume_explanation(pdf_id)
                        elif message_data.get("type") == "stop_explanation":
                            await explain_websocket_service.stop_explanation(pdf_id)
                        elif message_data.get("type") == "sentence_complete":
                            await explain_websocket_service.handle_sentence_complete(pdf_id)
                            
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for PDF: {pdf_id}")
                break
            except Exception as e:
                logger.error(f"WebSocket explain error: {e}", exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "message": f"WebSocket error: {str(e)}"
                })
                
    except Exception as e:
        logger.error(f"WebSocket explain connection error: {e}", exc_info=True)
        await websocket.send_json({
            "type": "error",
            "message": f"Connection error: {str(e)}"
        })
    finally:
        explain_websocket_service.disconnect(pdf_id)
        logger.info(f"WebSocket connection closed for PDF: {pdf_id}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)