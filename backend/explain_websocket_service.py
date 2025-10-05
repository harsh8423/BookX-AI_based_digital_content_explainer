import os
import json
import asyncio
import tempfile
import logging
import base64
from typing import Dict, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from groq import Groq
import httpx
from gemini_tts_service import gemini_tts_service
from notes_service import notes_service
from models import NoteCreate

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")

# Groq client
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

class ExplainSession:
    def __init__(self, pdf_id: str, websocket_service: 'ExplainWebSocketService', user_id: str = None):
        self.pdf_id = pdf_id
        self.user_id = user_id
        self.websocket_service = websocket_service
        self.current_content = ""
        self.reading_content = ""  # The original text content that was read
        self.topic = ""
        self.section_title = ""
        self.subsection_title = ""
        self.start_page = 0
        self.end_page = 0
        self.is_explaining = False
        self.is_paused = False
        self.is_streaming_audio = False
        self.current_audio_chunk = 0
        self.total_audio_chunks = 0
        self.conversation_context = []
        self.current_note = None
        self.audio_stream_task = None
        
    async def start_explanation(self, content: str, topic: str, section_title: str = "", subsection_title: str = "", start_page: int = 0, end_page: int = 0, reading_content: str = ""):
        """Start the explanation session with audio streaming"""
        logger.info(f"ExplainSession: Starting explanation for topic: {topic}")
        logger.info(f"ExplainSession: Content length: {len(content) if content else 0}")
        
        self.current_content = content
        self.reading_content = reading_content or content  # Use reading_content if provided, otherwise use content
        self.topic = topic
        self.section_title = section_title
        self.subsection_title = subsection_title
        self.start_page = start_page
        self.end_page = end_page
        self.is_explaining = True
        self.is_paused = False
        self.is_streaming_audio = False
        
        # Check if note already exists
        logger.info(f"ExplainSession: Checking for existing note...")
        existing_note = await notes_service.check_existing_note(
            self.pdf_id, self.user_id, topic, section_title, subsection_title
        )
        
        if existing_note:
            # Resume existing note
            await self.websocket_service._send_explanation_start(self.pdf_id)
            await self._resume_existing_note(existing_note)
            return
        
        # Initialize conversation context
        self.conversation_context = [
            {
                "role": "system",
                "content": f"""You are a knowledgeable tutor explaining the topic: "{topic}". You are having a conversation with a student who can ask questions at any time. 

Current explanation content: "{content}"

When the student asks a question:
1. Answer as the tutor, maintaining the conversational tone
2. Keep responses concise but helpful
3. Connect the answer back to the main topic when possible
4. Use "I" when referring to yourself as the tutor
5. Address the student directly with "you"

Remember: You are the tutor, the student is asking questions during your explanation."""
            }
        ]
        
        await self.websocket_service._send_explanation_start(self.pdf_id)
        await self._process_explanation_with_audio()
    
    async def _resume_existing_note(self, note):
        """Resume existing note by streaming its audio"""
        self.current_note = note
        await self.websocket_service._send_existing_note_found(self.pdf_id, note)
        
        if note.audio_url:
            # Stream existing audio
            await self._stream_existing_audio(note.audio_url)
        else:
            # Generate new audio for existing text content
            await self._process_explanation_with_audio()
    
    async def _process_explanation_with_audio(self):
        """Process explanation with audio generation and streaming"""
        try:
            logger.info(f"ExplainSession: Starting audio generation for topic: {self.topic}")
            self.is_streaming_audio = True
            
            # Generate audio explanation
            audio_chunks = []
            chunk_count = 0
            async for chunk in gemini_tts_service.generate_explanation_audio(self.current_content, self.topic):
                audio_chunks.append(chunk)
                chunk_count += 1
                logger.info(f"ExplainSession: Received audio chunk {chunk_count}, size: {len(chunk)} bytes")
                
                # Stream audio chunk to client
                await self.websocket_service._send_audio_chunk(self.pdf_id, chunk)
                
                # Check if paused
                while self.is_paused and self.is_explaining:
                    await asyncio.sleep(0.1)
                
                if not self.is_explaining:
                    break
            
            if self.is_explaining:
                # Combine all chunks for upload
                full_audio_data = b''.join(audio_chunks)
                
                # Upload to Cloudinary
                filename = f"{self.pdf_id}_{self.topic}_{self.start_page}_{self.end_page}"
                audio_result = await gemini_tts_service.generate_and_upload_explanation_audio(
                    self.current_content, self.topic, filename
                )
                
                if audio_result["success"]:
                    # Create note in database
                    await self._create_note(audio_result["audio_url"], len(full_audio_data))
                
                # Send completion signal
                await self.websocket_service._send_explanation_complete(self.pdf_id)
            
            self.is_streaming_audio = False
            self.is_explaining = False
            
        except Exception as e:
            logger.error(f"Error processing explanation with audio: {e}")
            await self.websocket_service._send_error(self.pdf_id, f"Audio processing error: {str(e)}")
            self.is_streaming_audio = False
            self.is_explaining = False
    
    async def _stream_existing_audio(self, audio_url: str):
        """Stream existing audio from Cloudinary"""
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream('GET', audio_url) as response:
                    async for chunk in response.aiter_bytes(chunk_size=4096):
                        await self.websocket_service._send_audio_chunk(self.pdf_id, chunk)
                        
                        # Check if paused
                        while self.is_paused and self.is_explaining:
                            await asyncio.sleep(0.1)
                        
                        if not self.is_explaining:
                            break
            
            if self.is_explaining:
                await self.websocket_service._send_explanation_complete(self.pdf_id)
            
            self.is_streaming_audio = False
            self.is_explaining = False
            
        except Exception as e:
            logger.error(f"Error streaming existing audio: {e}")
            await self.websocket_service._send_error(self.pdf_id, f"Audio streaming error: {str(e)}")
            self.is_streaming_audio = False
            self.is_explaining = False
    
    async def _create_note(self, audio_url: str, audio_size: int):
        """Create note in database"""
        try:
            note_data = NoteCreate(
                pdf_id=self.pdf_id,
                topic=self.topic,
                section_title=self.section_title,
                subsection_title=self.subsection_title,
                start_page=self.start_page,
                end_page=self.end_page,
                content_type="explain",
                reading_content=self.reading_content,  # The original text content that was read
                text_content=self.current_content,  # The textual explanation
                audio_url=audio_url,
                audio_size=audio_size,
                important_points=[],  # Can be extracted later
                short_notes="",  # Can be generated later
                created_by_user=self.user_id
            )
            
            self.current_note = await notes_service.create_note(note_data)
            logger.info(f"Created note for topic: {self.topic}")
            
        except Exception as e:
            logger.error(f"Error creating note: {e}")
    
    async def _process_explanation(self):
        """Process explanation sentence by sentence"""
        while self.is_explaining and self.current_sentence_index < len(self.sentences):
            # Check if paused before processing each sentence
            while self.is_paused and self.is_explaining:
                await asyncio.sleep(0.1)
            
            if not self.is_explaining:
                break
            
            current_sentence = self.sentences[self.current_sentence_index]
            
            # Send sentence to client
            await self.websocket_service._send_explanation_sentence(
                self.pdf_id, 
                current_sentence, 
                self.current_sentence_index,
                len(self.sentences)
            )
            
            # Wait for frontend to signal sentence completion
            # This will be handled by the sentence_complete message
            return  # Exit here, will be called again when sentence completes
        
        # Explanation completed
        await self.websocket_service._send_explanation_complete(self.pdf_id)
        self.is_explaining = False
    
    async def handle_user_question(self, question: str):
        """Handle user question during explanation with audio response"""
        if not groq_client:
            await self.websocket_service._send_error(self.pdf_id, "Groq client not configured")
            return
        
        try:
            # Pause explanation
            self.is_paused = True
            
            # Add user question to context
            self.conversation_context.append({
                "role": "user",
                "content": question
            })
            
            # Send question received signal
            await self.websocket_service._send_question_received(self.pdf_id, question)
            
            # Generate tutor response
            response = groq_client.chat.completions.create(
                model=GROQ_CHAT_MODEL,
                messages=self.conversation_context,
                stream=True,
                temperature=0.7,
                max_tokens=500
            )
            
            tutor_response = ""
            for chunk in response:
                if chunk.choices[0].delta.content:
                    tutor_response += chunk.choices[0].delta.content
                    await self.websocket_service._send_tutor_response_chunk(
                        self.pdf_id, 
                        chunk.choices[0].delta.content
                    )
            
            # Add tutor response to context
            self.conversation_context.append({
                "role": "assistant",
                "content": tutor_response
            })
            
            # Send response complete signal
            await self.websocket_service._send_tutor_response_complete(self.pdf_id, tutor_response)
            
            # Generate and stream audio response
            await self._stream_tutor_response_audio(tutor_response)
            
            # Resume explanation after a brief pause
            await asyncio.sleep(1.0)
            self.is_paused = False
            
            # Continue with explanation
            if self.is_explaining:
                await self._process_explanation_with_audio()
            
        except Exception as e:
            logger.error(f"Error handling user question: {e}")
            await self.websocket_service._send_error(self.pdf_id, f"Error processing question: {str(e)}")
            # Resume explanation even if there was an error
            self.is_paused = False
            if self.is_explaining:
                await self._process_explanation_with_audio()
    
    async def _stream_tutor_response_audio(self, response_text: str):
        """Stream tutor response audio"""
        try:
            await self.websocket_service._send_tutor_audio_start(self.pdf_id)
            
            async for chunk in gemini_tts_service.generate_tutor_response_audio(response_text):
                await self.websocket_service._send_audio_chunk(self.pdf_id, chunk)
                
                # Check if paused
                while self.is_paused and self.is_explaining:
                    await asyncio.sleep(0.1)
                
                if not self.is_explaining:
                    break
            
            await self.websocket_service._send_tutor_audio_complete(self.pdf_id)
            
        except Exception as e:
            logger.error(f"Error streaming tutor response audio: {e}")
            await self.websocket_service._send_error(self.pdf_id, f"Tutor audio error: {str(e)}")
    
    async def pause_explanation(self):
        """Pause the explanation"""
        self.is_paused = True
        await self.websocket_service._send_explanation_paused(self.pdf_id)
    
    async def resume_explanation(self):
        """Resume the explanation"""
        self.is_paused = False
        await self.websocket_service._send_explanation_resumed(self.pdf_id)
        if self.is_explaining:
            await self._process_explanation()
    
    async def stop_explanation(self):
        """Stop the explanation"""
        self.is_explaining = False
        self.is_paused = False
        await self.websocket_service._send_explanation_stopped(self.pdf_id)

class ExplainWebSocketService:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.explain_sessions: Dict[str, ExplainSession] = {}

    async def connect(self, websocket: WebSocket, pdf_id: str, user_id: str = None):
        await websocket.accept()
        self.active_connections[pdf_id] = websocket
        self.explain_sessions[pdf_id] = ExplainSession(pdf_id, self, user_id)
        
        await websocket.send_json({
            "type": "event",
            "event": "connected",
            "text": "Connected to explain mode"
        })

    def disconnect(self, pdf_id: str):
        if pdf_id in self.active_connections:
            del self.active_connections[pdf_id]
        if pdf_id in self.explain_sessions:
            del self.explain_sessions[pdf_id]

    async def start_explanation(self, pdf_id: str, content: str, topic: str, section_title: str = "", subsection_title: str = "", start_page: int = 0, end_page: int = 0, reading_content: str = ""):
        """Start explanation session"""
        logger.info(f"Starting explanation for PDF {pdf_id} with topic: {topic}")
        logger.info(f"Section: {section_title}, Subsection: {subsection_title}, Pages: {start_page}-{end_page}")
        logger.info(f"Content length: {len(content) if content else 0}")
        
        if pdf_id in self.explain_sessions:
            await self.explain_sessions[pdf_id].start_explanation(
                content, topic, section_title, subsection_title, start_page, end_page, reading_content
            )
        else:
            logger.error(f"No session found for PDF {pdf_id}")
            await self._send_error(pdf_id, "No active session found")

    async def process_audio_input(self, pdf_id: str, audio_data: bytes):
        """Process audio input using Groq Whisper"""
        try:
            if not groq_client:
                await self._send_error(pdf_id, "Groq client not configured")
                return
            
            # Create a temporary file for the audio data
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                temp_file.write(audio_data)
                temp_file_path = temp_file.name
            
            try:
                # Transcribe audio using Groq Whisper
                with open(temp_file_path, 'rb') as audio_file:
                    response = groq_client.audio.transcriptions.create(
                        model=GROQ_STT_MODEL,
                        file=audio_file
                    )
                
                user_text = response.text
                await self._send_transcript(pdf_id, user_text)
                
                # Process the transcribed text as a question
                if pdf_id in self.explain_sessions:
                    await self.explain_sessions[pdf_id].handle_user_question(user_text)
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
            
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            await self._send_error(pdf_id, f"Audio processing error: {str(e)}")

    async def pause_explanation(self, pdf_id: str):
        """Pause explanation"""
        if pdf_id in self.explain_sessions:
            await self.explain_sessions[pdf_id].pause_explanation()

    async def resume_explanation(self, pdf_id: str):
        """Resume explanation"""
        if pdf_id in self.explain_sessions:
            await self.explain_sessions[pdf_id].resume_explanation()

    async def stop_explanation(self, pdf_id: str):
        """Stop explanation"""
        if pdf_id in self.explain_sessions:
            await self.explain_sessions[pdf_id].stop_explanation()

    async def handle_sentence_complete(self, pdf_id: str):
        """Handle sentence completion from frontend"""
        if pdf_id in self.explain_sessions:
            session = self.explain_sessions[pdf_id]
            # Advance to next sentence
            session.current_sentence_index += 1
            # Continue with next sentence if explanation is still active
            if session.is_explaining and not session.is_paused:
                await session._process_explanation()

    # WebSocket message sending methods
    async def _send_explanation_start(self, pdf_id: str):
        """Send explanation start signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_start"
            })

    async def _send_explanation_sentence(self, pdf_id: str, sentence: str, index: int, total: int):
        """Send explanation sentence"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_sentence",
                "sentence": sentence,
                "index": index,
                "total": total
            })

    async def _send_explanation_complete(self, pdf_id: str):
        """Send explanation completion signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_complete"
            })

    async def _send_explanation_paused(self, pdf_id: str):
        """Send explanation paused signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_paused"
            })

    async def _send_explanation_resumed(self, pdf_id: str):
        """Send explanation resumed signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_resumed"
            })

    async def _send_explanation_stopped(self, pdf_id: str):
        """Send explanation stopped signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "explanation_stopped"
            })

    async def _send_question_received(self, pdf_id: str, question: str):
        """Send question received signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "question_received",
                "question": question
            })

    async def _send_tutor_response_chunk(self, pdf_id: str, chunk: str):
        """Send tutor response chunk"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "tutor_response_chunk",
                "chunk": chunk
            })

    async def _send_tutor_response_complete(self, pdf_id: str, response: str):
        """Send tutor response complete"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "tutor_response_complete",
                "response": response
            })

    async def _send_transcript(self, pdf_id: str, text: str):
        """Send transcript to client"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "transcript",
                "text": text
            })

    async def _send_error(self, pdf_id: str, message: str):
        """Send error message to client"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "error",
                "message": message
            })
    
    async def _send_audio_chunk(self, pdf_id: str, audio_chunk: bytes):
        """Send audio chunk to client"""
        if pdf_id in self.active_connections:
            # Encode audio chunk as base64
            audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')
            logger.info(f"WebSocket: Sending audio chunk to {pdf_id}, size: {len(audio_chunk)} bytes, base64 length: {len(audio_b64)}")
            await self.active_connections[pdf_id].send_json({
                "type": "audio_chunk",
                "data": audio_b64
            })
    
    async def _send_existing_note_found(self, pdf_id: str, note):
        """Send existing note found signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "existing_note_found",
                "note": {
                    "id": str(note.id),
                    "topic": note.topic,
                    "section_title": note.section_title,
                    "subsection_title": note.subsection_title,
                    "audio_url": note.audio_url,
                    "created_at": note.created_at.isoformat()
                }
            })
    
    async def _send_tutor_audio_start(self, pdf_id: str):
        """Send tutor audio start signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "tutor_audio_start"
            })
    
    async def _send_tutor_audio_complete(self, pdf_id: str):
        """Send tutor audio complete signal"""
        if pdf_id in self.active_connections:
            await self.active_connections[pdf_id].send_json({
                "type": "tutor_audio_complete"
            })

# Global service instance
explain_websocket_service = ExplainWebSocketService()