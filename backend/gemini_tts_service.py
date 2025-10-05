import os
import wave
import tempfile
import logging
from typing import Dict, Any, Optional, AsyncGenerator
from google import genai
from google.genai import types
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Gemini API setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Cloudinary setup (using unsigned uploads)
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_UPLOAD_PRESET = os.getenv("CLOUDINARY_UPLOAD_PRESET")

class GeminiTTSService:
    def __init__(self):
        self.client = gemini_client
        
    def _create_wave_file(self, filename: str, pcm_data: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2):
        """Create a WAV file from PCM data"""
        with wave.open(filename, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(pcm_data)
    
    def _convert_to_wav(self, audio_data: bytes, mime_type: str) -> bytes:
        """Convert audio data to WAV format with proper header"""
        import struct
        
        # Parse audio parameters from MIME type
        parameters = self._parse_audio_mime_type(mime_type)
        bits_per_sample = parameters["bits_per_sample"]
        sample_rate = parameters["rate"]
        num_channels = 1
        data_size = len(audio_data)
        bytes_per_sample = bits_per_sample // 8
        block_align = num_channels * bytes_per_sample
        byte_rate = sample_rate * block_align
        chunk_size = 36 + data_size

        # Create WAV header
        header = struct.pack(
            "<4sI4s4sIHHIIHH4sI",
            b"RIFF",          # ChunkID
            chunk_size,       # ChunkSize
            b"WAVE",          # Format
            b"fmt ",          # Subchunk1ID
            16,               # Subchunk1Size
            1,                # AudioFormat
            num_channels,     # NumChannels
            sample_rate,      # SampleRate
            byte_rate,        # ByteRate
            block_align,      # BlockAlign
            bits_per_sample,  # BitsPerSample
            b"data",          # Subchunk2ID
            data_size         # Subchunk2Size
        )
        return header + audio_data
    
    def _parse_audio_mime_type(self, mime_type: str) -> Dict[str, int]:
        """Parse audio MIME type to extract parameters"""
        bits_per_sample = 16
        rate = 24000

        parts = mime_type.split(";")
        for param in parts:
            param = param.strip()
            if param.lower().startswith("rate="):
                try:
                    rate_str = param.split("=", 1)[1]
                    rate = int(rate_str)
                except (ValueError, IndexError):
                    pass
            elif param.startswith("audio/L"):
                try:
                    bits_per_sample = int(param.split("L", 1)[1])
                except (ValueError, IndexError):
                    pass

        return {"bits_per_sample": bits_per_sample, "rate": rate}
    
    async def generate_explanation_audio(self, content: str, topic: str) -> AsyncGenerator[bytes, None]:
        """Generate audio explanation with multi-speaker TTS"""
        if not self.client:
            raise Exception("Gemini client not configured")
        
        logger.info(f"GeminiTTS: Generating audio for topic: {topic}")
        logger.info(f"GeminiTTS: Content length: {len(content)}")
        
        # Enhanced prompt for multi-speaker TTS
        enhanced_prompt = f"""Create a lively educational conversation about "{topic}" between a knowledgeable tutor and a curious student.

Tutor: Should sound warm, knowledgeable, and engaging. Use a teaching tone that's clear and encouraging.
Student: Should sound curious, asking thoughtful questions, and showing understanding.

Format the conversation like this:
Tutor: [explanation content]
Student: [thoughtful question or comment]
Tutor: [continuing explanation]

Make it feel like a natural conversation while covering the topic comprehensively. The tutor should explain concepts clearly, and the student should ask clarifying questions that help deepen understanding.

Content to explain: {content}

Create an engaging conversation that makes learning enjoyable and interactive."""

        try:
            logger.info("GeminiTTS: Calling Gemini API for TTS generation...")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=enhanced_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name="Kore"  # Warm, knowledgeable voice
                            )
                        )
                    )
                )
            )

            logger.info("GeminiTTS: Received response from Gemini API")
            
            # Extract audio data
            if (response.candidates and 
                response.candidates[0].content and 
                response.candidates[0].content.parts and
                response.candidates[0].content.parts[0].inline_data):
                
                inline_data = response.candidates[0].content.parts[0].inline_data
                audio_data = inline_data.data
                mime_type = inline_data.mime_type
                
                logger.info(f"GeminiTTS: Audio data size: {len(audio_data)} bytes, MIME type: {mime_type}")
                
                # Convert to WAV format
                wav_data = self._convert_to_wav(audio_data, mime_type)
                logger.info(f"GeminiTTS: Converted to WAV, size: {len(wav_data)} bytes")
                
                # Yield audio data in chunks for streaming
                chunk_size = 4096
                chunk_count = 0
                for i in range(0, len(wav_data), chunk_size):
                    chunk = wav_data[i:i + chunk_size]
                    chunk_count += 1
                    logger.info(f"GeminiTTS: Yielding chunk {chunk_count}, size: {len(chunk)} bytes")
                    yield chunk
            else:
                logger.error("GeminiTTS: No audio data received from Gemini TTS")
                raise Exception("No audio data received from Gemini TTS")
                
        except Exception as e:
            logger.error(f"GeminiTTS: Error generating TTS audio: {e}")
            raise
    
    async def generate_tutor_response_audio(self, response_text: str) -> AsyncGenerator[bytes, None]:
        """Generate audio for tutor responses to user questions"""
        if not self.client:
            raise Exception("Gemini client not configured")
        
        # Format for single speaker (tutor)
        formatted_prompt = f"""Tutor: {response_text}"""
        
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=formatted_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name="Kore"  # Same voice as tutor in main explanation
                            )
                        )
                    )
                )
            )

            # Extract audio data
            if (response.candidates and 
                response.candidates[0].content and 
                response.candidates[0].content.parts and
                response.candidates[0].content.parts[0].inline_data):
                
                inline_data = response.candidates[0].content.parts[0].inline_data
                audio_data = inline_data.data
                mime_type = inline_data.mime_type
                
                # Convert to WAV format
                wav_data = self._convert_to_wav(audio_data, mime_type)
                
                # Yield audio data in chunks for streaming
                chunk_size = 4096
                for i in range(0, len(wav_data), chunk_size):
                    yield wav_data[i:i + chunk_size]
            else:
                raise Exception("No audio data received from Gemini TTS")
                
        except Exception as e:
            logger.error(f"Error generating tutor response audio: {e}")
            raise
    
    async def upload_audio_to_cloudinary(self, audio_data: bytes, filename: str) -> str:
        """Upload audio file to Cloudinary using unsigned upload and return URL"""
        try:
            if not CLOUDINARY_CLOUD_NAME or not CLOUDINARY_UPLOAD_PRESET:
                raise Exception("Missing Cloudinary cloud name or upload preset")
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                temp_file.write(audio_data)
                temp_file_path = temp_file.name
            
            try:
                # Upload using unsigned upload (like frontend)
                url = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/raw/upload"
                
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    data = aiohttp.FormData()
                    data.add_field('file', open(temp_file_path, 'rb'), filename=f"{filename}.wav", content_type='audio/wav')
                    data.add_field('upload_preset', CLOUDINARY_UPLOAD_PRESET)
                    data.add_field('folder', 'bookx/audio')
                    data.add_field('public_id', f"explanation_{filename}")
                    
                    async with session.post(url, data=data) as response:
                        if response.status == 200:
                            result = await response.json()
                            return result["secure_url"]
                        else:
                            error_text = await response.text()
                            raise Exception(f"Cloudinary upload failed: {response.status} {error_text}")
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
                    
        except Exception as e:
            logger.error(f"Error uploading audio to Cloudinary: {e}")
            raise
    
    async def generate_and_upload_explanation_audio(self, content: str, topic: str, filename: str) -> Dict[str, Any]:
        """Generate explanation audio and upload to Cloudinary"""
        try:
            # Collect all audio data
            audio_chunks = []
            async for chunk in self.generate_explanation_audio(content, topic):
                audio_chunks.append(chunk)
            
            # Combine chunks
            full_audio_data = b''.join(audio_chunks)
            
            # Upload to Cloudinary
            audio_url = await self.upload_audio_to_cloudinary(full_audio_data, filename)
            
            return {
                "audio_url": audio_url,
                "audio_size": len(full_audio_data),
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error generating and uploading explanation audio: {e}")
            return {
                "error": str(e),
                "success": False
            }

# Global service instance
gemini_tts_service = GeminiTTSService()