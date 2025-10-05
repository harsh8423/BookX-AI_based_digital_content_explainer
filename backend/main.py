from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import os
import json
import logging
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List

from database import get_database
from auth import auth_router
from pdfs import pdf_router
from content_service import content_service
from explain_websocket_service import explain_websocket_service
from notes_service import notes_service
from flashcard_service import flashcard_service
from quiz_service import quiz_service
from models import NoteResponse, NotesBySectionResponse, FlashcardSetResponse, QuizResponse, QuizAttemptResponse
from bson import ObjectId

load_dotenv()

# Setup logging
logger = logging.getLogger(__name__)

# Request models
class ContentRequest(BaseModel):
    start_page: int
    end_page: int
    topic: str
    type: str  # 'read' or 'explain'
    section_title: str = ""  # Optional section title
    subsection_title: str = ""  # Optional subsection title

class FlashcardRequest(BaseModel):
    start_page: int
    end_page: int
    topic: str
    type: str = "flashcards"  # Always 'flashcards'
    section_title: str = ""  # Optional section title
    subsection_title: str = ""  # Optional subsection title
    regenerate: bool = False  # Whether to regenerate existing flashcards

class QuizRequest(BaseModel):
    start_page: int
    end_page: int
    topic: str
    type: str = "quiz"  # Always 'quiz'
    section_title: str = ""  # Optional section title
    subsection_title: str = ""  # Optional subsection title
    regenerate: bool = False  # Whether to regenerate existing quiz

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting up...")
    yield
    # Shutdown
    print("Shutting down...")

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

@app.get("/")
async def root():
    return {"message": "BookX API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/pdfs/{pdf_id}/content")
async def generate_content(pdf_id: str, request: ContentRequest):
    """Generate content (read or explain) for specific PDF pages"""
    try:
        # Get PDF details from database
        db = await get_database()
        pdf_collection = db["pdfs"]
        pdf_doc = await pdf_collection.find_one({"_id": ObjectId(pdf_id)})
        
        if not pdf_doc:
            raise HTTPException(status_code=404, detail="PDF not found")
        
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
            raise HTTPException(status_code=500, detail=result["error"])
        
        # If it's a "read" type, save it to notes
        if request.type == "read" and "content" in result:
            try:
                from models import NoteCreate
                
                # Extract reading content from PDF pages for notes
                reading_content = await content_service.extract_reading_content(
                    pdf_id=pdf_id,
                    cloudinary_url=pdf_doc["cloudinary_url"],
                    start_page=request.start_page,
                    end_page=request.end_page
                )
                
                note_data = NoteCreate(
                    pdf_id=pdf_id,
                    topic=request.topic,
                    section_title=request.section_title,
                    subsection_title=request.subsection_title,
                    start_page=request.start_page,
                    end_page=request.end_page,
                    content_type="read",
                    reading_content=reading_content,
                    text_content=result["content"],
                    audio_url=None,  # No audio for read content
                    audio_size=None,
                    important_points=[],
                    short_notes="",
                    created_by_user="default_user"
                )
                
                note = await notes_service.create_note(note_data)
                logger.info(f"Created read note: {note.id}")
                
                # Add note info to result
                result["note_id"] = str(note.id)
                result["saved_to_notes"] = True
                
            except Exception as e:
                logger.error(f"Error saving read content to notes: {e}")
                # Don't fail the request if note saving fails
                result["note_save_error"] = str(e)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

@app.get("/pdfs/{pdf_id}/notes", response_model=List[NoteResponse])
async def get_pdf_notes(pdf_id: str, user_id: str = "default_user"):
    """Get all notes for a specific PDF"""
    try:
        notes = await notes_service.get_notes_by_pdf(pdf_id, user_id)
        return notes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notes: {str(e)}")

@app.get("/pdfs/{pdf_id}/notes/sections", response_model=List[NotesBySectionResponse])
async def get_notes_by_sections(pdf_id: str, user_id: str = "default_user"):
    """Get notes grouped by sections for the notes tab"""
    try:
        notes = await notes_service.get_notes_grouped_by_section(pdf_id, user_id)
        return notes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notes by sections: {str(e)}")

@app.get("/pdfs/{pdf_id}/notes/section/{section_title}", response_model=List[NoteResponse])
async def get_notes_by_section(pdf_id: str, section_title: str, user_id: str = "default_user", subsection_title: str = None):
    """Get notes for a specific section"""
    try:
        notes = await notes_service.get_notes_by_section(pdf_id, user_id, section_title, subsection_title)
        return notes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notes by section: {str(e)}")

@app.get("/pdfs/{pdf_id}/notes/topic/{topic}", response_model=List[NoteResponse])
async def get_notes_by_topic(pdf_id: str, topic: str, user_id: str = "default_user"):
    """Get notes for a specific topic"""
    try:
        notes = await notes_service.get_notes_by_topic(pdf_id, user_id, topic)
        return notes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notes by topic: {str(e)}")

@app.delete("/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = "default_user"):
    """Delete a specific note"""
    try:
        success = await notes_service.delete_note(note_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"message": "Note deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete note: {str(e)}")

# Flashcard endpoints
@app.post("/pdfs/{pdf_id}/flashcards")
async def generate_flashcards(pdf_id: str, request: FlashcardRequest):
    """Generate flashcards for specific PDF pages"""
    try:
        # Debug logging
        logger.info(f"Flashcard request received: {request.dict()}")
        
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
            section_title=request.section_title,
            subsection_title=request.subsection_title,
            user_id="default_user",
            regenerate=getattr(request, 'regenerate', False)
        )
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Flashcard generation error: {str(e)}")
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
            section_title=request.section_title,
            subsection_title=request.subsection_title,
            user_id="default_user",
            regenerate=getattr(request, 'regenerate', False)
        )
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
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
    print(f"WebSocket explain connection established for PDF: {pdf_id}")
    await explain_websocket_service.connect(websocket, pdf_id, "default_user")
    
    try:
        # Handle messages
        while True:
            try:
                data = await websocket.receive()
                print(f"Received WebSocket explain data: {data['type']}")
                
                if data["type"] == "websocket.receive":
                    if "bytes" in data:
                        # Handle binary audio data
                        audio_data = data["bytes"]
                        print(f"Processing audio data: {len(audio_data)} bytes")
                        await explain_websocket_service.process_audio_input(pdf_id, audio_data)
                    elif "text" in data:
                        # Handle text messages
                        message_data = json.loads(data["text"])
                        print(f"Processing text message: {message_data}")
                        
                        if message_data.get("type") == "start_explanation":
                            content = message_data.get("content", "")
                            topic = message_data.get("topic", "")
                            section_title = message_data.get("section_title", "")
                            subsection_title = message_data.get("subsection_title", "")
                            start_page = message_data.get("start_page", 0)
                            end_page = message_data.get("end_page", 0)
                            user_id = message_data.get("user_id", "default_user")
                            reading_content = message_data.get("reading_content", content)  # Use reading_content if provided, otherwise use content
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
                            # Handle sentence completion from frontend
                            await explain_websocket_service.handle_sentence_complete(pdf_id)
                            
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket explain error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": f"WebSocket error: {str(e)}"
                })
                
    except Exception as e:
        print(f"WebSocket explain connection error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Connection error: {str(e)}"
        })
    finally:
        explain_websocket_service.disconnect(pdf_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)