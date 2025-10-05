# Gemini TTS Integration with Audio Streaming and Notes System

## Overview
This implementation adds Gemini text-to-speech functionality to the explain mode with audio streaming via WebSocket, along with a comprehensive notes system for storing and managing explanations.

## Key Features Implemented

### 1. Gemini TTS Service (`backend/gemini_tts_service.py`)
- **Multi-speaker TTS**: Uses Gemini's multi-speaker voice configuration with "Kore" (tutor) and "Puck" (student) voices
- **Audio Generation**: Generates conversational explanations between tutor and student
- **Audio Streaming**: Streams audio chunks in real-time via WebSocket
- **Cloudinary Integration**: Uploads generated audio to Cloudinary for persistent storage
- **WAV Format Support**: Converts audio to proper WAV format with headers

### 2. Notes System (`backend/notes_service.py`)
- **MongoDB Integration**: Stores notes with structured data including audio URLs
- **Section Organization**: Groups notes by PDF sections and subsections
- **Topic-based Search**: Find notes by topic with case-insensitive search
- **CRUD Operations**: Create, read, update, and delete notes
- **User Isolation**: Notes are user-specific for privacy

### 3. Enhanced WebSocket Service (`backend/explain_websocket_service.py`)
- **Audio Streaming**: Replaces text-based explanations with audio streaming
- **Smart Interaction**: Handles user questions with audio responses
- **Pause/Resume**: Intelligent pause and resume functionality
- **Note Integration**: Checks for existing notes and resumes them
- **Error Handling**: Robust error handling for audio processing

### 4. MongoDB Models (`backend/models.py`)
- **Note Models**: Complete data models for notes with audio metadata
- **Response Models**: Structured response models for API endpoints
- **Section Organization**: Models for organizing notes by sections

### 5. API Endpoints (`backend/main.py`)
- **Notes API**: RESTful endpoints for notes management
- **Section-based Queries**: Get notes grouped by sections
- **Topic Search**: Search notes by topic
- **Enhanced WebSocket**: Updated WebSocket with audio streaming support

### 6. Frontend Components

#### NotesTab Component (`frontend/app/components/NotesTab.js`)
- **Section Organization**: Displays notes grouped by sections/subsections
- **Audio Playback**: Play existing explanations from notes
- **Note Management**: Delete notes with confirmation
- **Duration Display**: Shows estimated audio duration
- **Responsive Design**: Modern UI with loading states and error handling

#### Enhanced ReadingExplanation Component (`frontend/app/components/ReadingExplanation.js`)
- **Audio Streaming**: Handles real-time audio streaming from WebSocket
- **Existing Audio Playback**: Plays audio from saved notes
- **Audio Context Management**: Uses Web Audio API for audio playback
- **Pause/Resume**: Smart audio control with pause/resume functionality
- **Error Handling**: Graceful error handling for audio issues

#### Updated Chat Page (`frontend/app/pdf/[id]/chat/page.js`)
- **Notes Tab**: Added notes tab to the main interface
- **Note Playback**: Integration with notes for seamless playback
- **Enhanced Content Request**: Passes section information for note creation

## Workflow Implementation

### 1. Explanation Generation
1. User clicks "Explain" on a section
2. System checks if note already exists for that section/topic
3. If exists: Streams existing audio from Cloudinary
4. If not: Generates new explanation with Gemini TTS
5. Streams audio chunks in real-time to client
6. Uploads complete audio to Cloudinary
7. Creates note in MongoDB with audio URL

### 2. User Interaction Handling
1. User raises hand/asks question during explanation
2. System pauses current audio stream
3. Processes question with Groq LLM
4. Generates tutor response audio with Gemini TTS
5. Streams response audio to user
6. Resumes original explanation audio

### 3. Notes Management
1. Notes are automatically created after explanation completion
2. Organized by PDF sections and subsections
3. Accessible via dedicated Notes tab
4. Can be played, deleted, or searched
5. History is maintained for each user

## Technical Implementation Details

### Audio Processing
- **Format**: WAV format with proper headers
- **Streaming**: 4KB chunks for real-time streaming
- **Quality**: 24kHz, 16-bit, mono audio
- **Storage**: Cloudinary with organized folder structure

### Database Schema
```javascript
{
  pdf_id: String,
  topic: String,
  section_title: String,
  subsection_title: String,
  start_page: Number,
  end_page: Number,
  content_type: String,
  text_content: String,
  audio_url: String,
  audio_size: Number,
  important_points: [String],
  short_notes: String,
  created_by_user: String,
  created_at: Date,
  updated_at: Date
}
```

### WebSocket Message Types
- `explanation_start`: Start of explanation
- `audio_chunk`: Audio data chunk (base64 encoded)
- `existing_note_found`: Existing note detected
- `explanation_complete`: Explanation finished
- `tutor_audio_start`: Tutor response starting
- `tutor_audio_complete`: Tutor response finished
- `explanation_paused`: Explanation paused
- `explanation_resumed`: Explanation resumed

## Environment Variables Required
```bash
GOOGLE_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
MONGODB_URL=your_mongodb_url
```

## Usage Instructions

### For Users
1. Navigate to a PDF's chat page
2. Click "Explain" on any section in the Index Content tab
3. Listen to the audio explanation with multi-speaker conversation
4. Ask questions by raising hand - system will pause and respond
5. Access saved explanations in the Notes tab
6. Play, delete, or search through your notes

### For Developers
1. Install dependencies: `pip install -r requirements.txt`
2. Set up environment variables
3. Run backend: `python main.py`
4. Run frontend: `npm run dev`
5. Test audio streaming functionality

## Benefits
- **Enhanced Learning**: Multi-speaker conversations make explanations more engaging
- **Persistent Storage**: Notes are saved and can be replayed anytime
- **Smart Interaction**: Seamless pause/resume for user questions
- **Organized History**: Notes organized by sections for easy navigation
- **Scalable Architecture**: Modular design allows easy extensions

## Future Enhancements
- **Voice Recognition**: Add voice input for questions
- **Note Sharing**: Share notes between users
- **Advanced Search**: Full-text search in notes
- **Audio Quality Settings**: Configurable audio quality
- **Offline Support**: Download notes for offline access