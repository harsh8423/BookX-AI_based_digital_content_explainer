from pydantic import BaseModel, Field, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from typing import Optional, Dict, Any, Annotated, List
from datetime import datetime
from bson import ObjectId

class PyObjectId(ObjectId):
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        from pydantic_core import core_schema
        return core_schema.no_info_plain_validator_function(cls.validate)

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema, handler: GetJsonSchemaHandler) -> JsonSchemaValue:
        return {"type": "string"}

# User Models
class UserBase(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class UserCreate(UserBase):
    google_id: str

class User(UserBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    google_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_schema_serialize_defaults_required = True

# PDF Models
class PDFMetadata(BaseModel):
    pages: Optional[int] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    creator: Optional[str] = None
    producer: Optional[str] = None
    creation_date: Optional[str] = None
    modification_date: Optional[str] = None

class PDFIndexContent(BaseModel):
    title: Optional[str] = None
    index: Optional[List[Dict[str, Any]]] = None

class PDFBase(BaseModel):
    filename: str
    title: Optional[str] = None
    description: Optional[str] = None
    cloudinary_url: str
    public_id: str
    size: int
    metadata: Optional[PDFMetadata] = None
    analysis_status: Optional[str] = "pending"  # pending, analyzing, completed, failed
    index_content: Optional[PDFIndexContent] = None

class PDFCreate(PDFBase):
    user_id: str

class PDF(PDFBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_schema_serialize_defaults_required = True

# Auth Models
class GoogleAuthRequest(BaseModel):
    token: str

class UserResponse(BaseModel):
    id: str
    google_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"

# PDF Response Models
class PDFResponse(BaseModel):
    id: str
    filename: str
    title: Optional[str] = None
    description: Optional[str] = None
    cloudinary_url: str
    public_id: str
    size: int
    user_id: str
    metadata: Optional[PDFMetadata] = None
    analysis_status: Optional[str] = "pending"
    index_content: Optional[PDFIndexContent] = None
    created_at: datetime
    updated_at: datetime

# PDF Upload Models
class PDFUploadRequest(BaseModel):
    cloudinary_url: str
    filename: str
    size: int
    public_id: str

class PDFUploadResponse(BaseModel):
    id: str
    title: str
    description: str
    metadata: PDFMetadata
    analysis_status: str
    message: str

# PDF Reading Content Models
class PDFReadingRequest(BaseModel):
    pdf_url: str
    start_page: int = Field(..., ge=1, description="Starting page number (1-indexed)")
    end_page: int = Field(..., ge=1, description="Ending page number (1-indexed)")
    topic: str = Field(..., min_length=1, description="Topic name to create reading content")

class PDFReadingResponse(BaseModel):
    content: str
    pages_processed: str
    topic: str
    success: bool
    message: Optional[str] = None

# Notes Models
class NoteBase(BaseModel):
    pdf_id: str
    topic: str
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    start_page: int
    end_page: int
    content_type: str = "explain"  # explain, read, etc.
    reading_content: str  # The original text content that was read
    text_content: str  # The textual explanation
    audio_url: Optional[str] = None
    audio_size: Optional[int] = None
    important_points: Optional[List[str]] = None
    short_notes: Optional[str] = None
    created_by_user: str

class NoteCreate(NoteBase):
    pass

class Note(NoteBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_schema_serialize_defaults_required = True

class NoteResponse(BaseModel):
    id: str
    pdf_id: str
    topic: str
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    start_page: int
    end_page: int
    content_type: str
    reading_content: str  # The original text content that was read
    text_content: str  # The textual explanation
    audio_url: Optional[str] = None
    audio_size: Optional[int] = None
    important_points: Optional[List[str]] = None
    short_notes: Optional[str] = None
    created_by_user: str
    created_at: datetime
    updated_at: datetime

class NotesBySectionResponse(BaseModel):
    section_title: str
    subsection_title: Optional[str] = None
    notes: List[NoteResponse]
    total_notes: int

# Flashcard Models
class FlashcardItem(BaseModel):
    question: str
    answer: str

class FlashcardSet(BaseModel):
    pdf_id: str
    topic: str
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    start_page: int
    end_page: int
    flashcards: List[FlashcardItem]
    created_by_user: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class FlashcardSetCreate(FlashcardSet):
    pass

class FlashcardSetResponse(FlashcardSet):
    id: str

# Quiz Models
class QuizOption(BaseModel):
    text: str
    is_correct: bool

class QuizQuestion(BaseModel):
    question: str
    options: List[QuizOption]
    explanation: str

class QuizResult(BaseModel):
    question_index: int
    selected_option: int
    is_correct: bool
    time_taken: float  # in seconds

class Quiz(BaseModel):
    pdf_id: str
    topic: str
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    start_page: int
    end_page: int
    questions: List[QuizQuestion]
    created_by_user: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class QuizCreate(Quiz):
    pass

class QuizResponse(Quiz):
    id: str

class QuizAttempt(BaseModel):
    quiz_id: str
    user_id: str
    results: List[QuizResult]
    total_score: int
    total_questions: int
    completion_time: float  # in seconds
    created_at: datetime = Field(default_factory=datetime.utcnow)

class QuizAttemptResponse(QuizAttempt):
    id: str

# Request Models for API Endpoints
class ContentRequest(BaseModel):
    """Request model for generating content (read or explain)"""
    start_page: int
    end_page: int
    topic: str
    type: str  # 'read' or 'explain'
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None

class FlashcardRequest(BaseModel):
    """Request model for generating flashcards"""
    start_page: int
    end_page: int
    topic: str
    type: str = "flashcards"
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    regenerate: bool = False

class QuizRequest(BaseModel):
    """Request model for generating quizzes"""
    start_page: int
    end_page: int
    topic: str
    type: str = "quiz"
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None
    regenerate: bool = False

# Explanation Models
class ExplanationCache(BaseModel):
    """Model for cached explanations"""
    unique_key: str
    pdf_id: str
    topic: str
    start_page: int
    end_page: int
    text_content: str
    audio_url: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ExplanationRequest(BaseModel):
    """Request model for generating explanations"""
    start_page: int
    end_page: int
    topic: str
    section_title: Optional[str] = None
    subsection_title: Optional[str] = None

class ExplanationResponse(BaseModel):
    """Response model for explanations"""
    text_content: str
    audio_url: str
    topic: str
    start_page: int
    end_page: int
    cached: bool = False

class QARequest(BaseModel):
    """Request model for Q&A"""
    question: str
    explanation_text: str
    topic: str

class QAResponse(BaseModel):
    """Response model for Q&A"""
    question_text: Optional[str] = None  # Transcribed question (if audio input)
    answer_text: str
    audio_base64: str  # Base64 encoded audio
    audio_format: str = "mp3"  # mp3 or wav

class PDFChatRequest(BaseModel):
    """Request model for PDF chat"""
    query: str
    start_page: int
    end_page: int

class PDFChatResponse(BaseModel):
    """Response model for PDF chat"""
    answer: str