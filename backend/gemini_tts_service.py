"""
Gemini TTS Service
Handles text-to-speech generation using Google Gemini API
"""

import os
import wave
import tempfile
import logging
import base64
import sys
import json
import binascii
import httpx
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

# Minimax API setup
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY")

# Cloudinary setup (using unsigned uploads)
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_UPLOAD_PRESET = os.getenv("CLOUDINARY_UPLOAD_PRESET")

# Configure cloudinary
if CLOUDINARY_CLOUD_NAME:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        secure=True
    )


def wave_file(filename: str, pcm: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2):
    """
    Write PCM audio data to a WAV file.
    
    Args:
        filename: Output filename
        pcm: Raw PCM audio bytes
        channels: Number of audio channels (1 for mono, 2 for stereo)
        rate: Sample rate in Hz (24000 for Gemini)
        sample_width: Sample width in bytes (2 for 16-bit audio)
    """
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)


async def generate_minimax_audio_async(text: str, voice_id: str = "moss_audio_d1efbcbb-a84b-11f0-acd3-2a7238f4ad26") -> AsyncGenerator[bytes, None]:
    """
    Generate audio using Minimax TTS API (async generator for streaming).
    
    Args:
        text: Text to convert to speech
        voice_id: Voice ID to use
        
    Yields:
        Audio chunks as bytes
    """
    if not MINIMAX_API_KEY:
        raise Exception("Minimax API key not configured")
    
    logger.info(f"MinimaxTTS: Generating audio (text length: {len(text)})")
    
    try:
        # Build payload
        payload = {
            "model": "speech-2.5-hd-preview",
            "text": text,
            "stream": False,
            "language_boost": "auto",
            "output_format": "hex",
            "voice_setting": {
                "voice_id": voice_id,
                "speed": 1.0,
                "vol": 1.0,
                "pitch": 0
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": "mp3",
                "channel": 1
            }
        }
        
        headers = {
            'Authorization': f'Bearer {MINIMAX_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        # Make async API call
        url = "https://api.minimax.io/v1/t2a_v2"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            response_data = response.json()
        
        # Check for API errors
        if response_data.get("base_resp", {}).get("status_code") != 0:
            raise Exception(f"Minimax API Error: {response_data.get('base_resp', {}).get('status_msg', 'Unknown error')}")
        
        # Extract hex audio data
        data_field = response_data.get("data")
        if not data_field:
            raise Exception(f"No data field returned from Minimax API. Response keys: {list(response_data.keys())}")
        
        hex_audio = data_field.get("audio")
        if not hex_audio or not isinstance(hex_audio, str):
            raise Exception(f"No valid audio field in Minimax response")
        
        # Convert hex to MP3 bytes
        try:
            hex_clean = hex_audio.replace(' ', '').replace('\n', '').replace('\r', '')
            audio_bytes = binascii.unhexlify(hex_clean)
        except Exception as e:
            raise Exception(f"Failed to convert hex audio: {str(e)}")
        
        logger.info(f"MinimaxTTS: Generated audio ({len(audio_bytes)} bytes)")
        
        # Yield audio in chunks for streaming
        chunk_size = 4096
        chunk_count = 0
        offset = 0
        while offset < len(audio_bytes):
            chunk = audio_bytes[offset:offset + chunk_size]
            chunk_count += 1
            logger.debug(f"MinimaxTTS: Yielding chunk {chunk_count}, size: {len(chunk)} bytes")
            yield chunk
            offset += chunk_size
        
        logger.info(f"MinimaxTTS: Streamed {chunk_count} chunks")
        
    except Exception as e:
        logger.error(f"MinimaxTTS: Error generating audio: {e}", exc_info=True)
        raise


def upload_to_cloudinary(file_path: str, cloudinary_options: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Upload file to Cloudinary using unsigned upload.
    
    Args:
        file_path: Path to the file to upload
        cloudinary_options: Additional options for Cloudinary upload
        
    Returns:
        Dictionary with upload result containing secure_url
    """
    if not CLOUDINARY_CLOUD_NAME or not CLOUDINARY_UPLOAD_PRESET:
        raise Exception("Missing Cloudinary cloud name or upload preset")
    
    options = cloudinary_options or {}
    
    # Set default options for unsigned upload
    upload_options = {
        "upload_preset": CLOUDINARY_UPLOAD_PRESET,
        "folder": options.get("folder", "bookx/audio"),
        "resource_type": "raw",
        "unsigned": True,  # Important: Mark as unsigned upload
    }
    
    # Add any additional options
    if "public_id" in options:
        upload_options["public_id"] = options["public_id"]
    
    # Upload file using unsigned upload
    result = cloudinary.uploader.unsigned_upload(
        file_path, 
        CLOUDINARY_UPLOAD_PRESET,
        **{k: v for k, v in upload_options.items() if k != 'upload_preset' and k != 'unsigned'}
    )
    
    return {
        "secure_url": result.get("secure_url"),
        "public_id": result.get("public_id"),
        "bytes": result.get("bytes", 0)
    }


def generate_audio(text: str, voice_name: str = "Kore", cloudinary_options: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Generate audio from text using Gemini TTS, upload to Cloudinary, and clean up.
    
    Args:
        text: The text to convert to speech
        voice_name: Voice to use (e.g., 'Kore', 'Aoede', 'Charon', 'Fenrir', 'Puck')
        cloudinary_options: Options for Cloudinary upload
    
    Returns:
        dict: Result containing status, url, and msg
    """
    if not gemini_client:
        return {
            "status": "failed",
            "url": None,
            "msg": "Gemini client not configured"
        }
    
    # Create temporary file
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    temp_filename = temp_file.name
    temp_file.close()
    
    try:
        # Generate audio using Gemini TTS
        logger.info(f"Generating audio with voice: {voice_name}")
        
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name,
                        )
                    )
                ),
            )
        )
        
        # Get the audio data - it's base64 encoded
        audio_data_b64 = response.candidates[0].content.parts[0].inline_data.data
        mime_type = response.candidates[0].content.parts[0].inline_data.mime_type
        
        # Decode base64 to get raw PCM audio bytes
        pcm_audio = base64.b64decode(audio_data_b64)
        
        # Write to WAV file with proper parameters for Gemini audio
        # Gemini returns: 24kHz, mono (1 channel), 16-bit (2 bytes) PCM
        wave_file(temp_filename, pcm_audio, channels=1, rate=24000, sample_width=2)
        
        # Upload to Cloudinary
        logger.info("Uploading audio to Cloudinary...")
        cloudinary_result = upload_to_cloudinary(
            temp_filename,
            cloudinary_options or {}
        )
        
        # Clean up temporary file
        if os.path.exists(temp_filename):
            os.unlink(temp_filename)
        
        return {
            "status": "success",
            "url": cloudinary_result.get("secure_url"),
            "msg": None,
            "data_size": len(pcm_audio),
            "mime_type": mime_type,
            "voice_used": voice_name,
            "text_length": len(text)
        }
        
    except Exception as e:
        logger.error(f"Error generating audio: {e}", exc_info=True)
        # Clean up temporary file on error
        if os.path.exists(temp_filename):
            try:
                os.unlink(temp_filename)
            except:
                pass
        
        return {
            "status": "failed",
            "url": None,
            "msg": str(e)
        }


class GeminiTTSService:
    """Service class for Gemini TTS operations with async support"""
    
    def __init__(self):
        self.client = gemini_client
    
    async def generate_explanation_audio(self, content: str, topic: str) -> AsyncGenerator[bytes, None]:
        """
        Generate audio explanation - tries Minimax first, falls back to Gemini.
        Async generator for streaming.
        """
        logger.info(f"TTS: Generating audio for topic: {topic}")
        logger.info(f"TTS: Content length: {len(content)}")
        
        # Try Minimax first
        if MINIMAX_API_KEY:
            try:
                logger.info("TTS: Attempting Minimax TTS...")
                async for chunk in generate_minimax_audio_async(content):
                    yield chunk
                logger.info("TTS: Successfully generated audio using Minimax")
                return
            except Exception as minimax_error:
                logger.warning(f"TTS: Minimax failed: {minimax_error}. Falling back to Gemini...")
        else:
            logger.info("TTS: Minimax API key not configured. Using Gemini...")
        
        # Fallback to Gemini
        if not self.client:
            raise Exception("Neither Minimax nor Gemini client configured")
        
        logger.info("TTS: Using Gemini TTS as fallback...")
        tts_text = content

        try:
            logger.info("GeminiTTS: Calling Gemini API for TTS generation...")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=tts_text,
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
                response.candidates[0].content.parts):
                
                # Find the part with inline_data (audio)
                audio_part = None
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        audio_part = part
                        break
                
                if audio_part and audio_part.inline_data:
                    inline_data = audio_part.inline_data
                    audio_data_b64 = inline_data.data
                    mime_type = inline_data.mime_type
                    
                    logger.info(f"GeminiTTS: Audio data received, MIME type: {mime_type}")
                    
                    # Decode base64 to get raw PCM audio bytes
                    pcm_audio = base64.b64decode(audio_data_b64)
                    
                    # Create temporary WAV file
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                    temp_filename = temp_file.name
                    temp_file.close()
                    
                    try:
                        # Write to WAV file with proper parameters
                        wave_file(temp_filename, pcm_audio, channels=1, rate=24000, sample_width=2)
                        
                        # Read WAV file and yield in chunks for streaming
                        chunk_size = 4096
                        chunk_count = 0
                        with open(temp_filename, 'rb') as wav_file:
                            while True:
                                chunk = wav_file.read(chunk_size)
                                if not chunk:
                                    break
                                chunk_count += 1
                                logger.debug(f"GeminiTTS: Yielding chunk {chunk_count}, size: {len(chunk)} bytes")
                                yield chunk
                        
                        logger.info(f"GeminiTTS: Streamed {chunk_count} chunks")
                        
                    finally:
                        # Clean up temporary file
                        if os.path.exists(temp_filename):
                            try:
                                os.unlink(temp_filename)
                            except:
                                pass
                else:
                    logger.error("GeminiTTS: No audio part found in response")
                    raise Exception("No audio data received from Gemini TTS")
            else:
                logger.error("GeminiTTS: Response structure is invalid")
                raise Exception("No audio data received from Gemini TTS")
                
        except Exception as e:
            logger.error(f"GeminiTTS: Error generating TTS audio: {e}", exc_info=True)
            raise
    
    async def generate_tutor_response_audio(self, response_text: str) -> AsyncGenerator[bytes, None]:
        """
        Generate audio for tutor responses to user questions.
        Tries Minimax first, falls back to Gemini.
        """
        # Try Minimax first
        if MINIMAX_API_KEY:
            try:
                logger.info("TTS: Attempting Minimax for tutor response...")
                async for chunk in generate_minimax_audio_async(response_text):
                    yield chunk
                logger.info("TTS: Successfully generated tutor response using Minimax")
                return
            except Exception as minimax_error:
                logger.warning(f"TTS: Minimax failed for tutor response: {minimax_error}. Falling back to Gemini...")
        
        # Fallback to Gemini
        if not self.client:
            raise Exception("Neither Minimax nor Gemini client configured")
        
        logger.info("TTS: Using Gemini TTS for tutor response...")
        
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=response_text,
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
                response.candidates[0].content.parts):
                
                # Find the part with inline_data (audio)
                audio_part = None
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        audio_part = part
                        break
                
                if audio_part and audio_part.inline_data:
                    inline_data = audio_part.inline_data
                    audio_data_b64 = inline_data.data
                    mime_type = inline_data.mime_type
                    
                    # Decode base64 to get raw PCM audio bytes
                    pcm_audio = base64.b64decode(audio_data_b64)
                    
                    # Create temporary WAV file
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                    temp_filename = temp_file.name
                    temp_file.close()
                    
                    try:
                        # Write to WAV file
                        wave_file(temp_filename, pcm_audio, channels=1, rate=24000, sample_width=2)
                        
                        # Read and yield in chunks for streaming
                        chunk_size = 4096
                        with open(temp_filename, 'rb') as wav_file:
                            while True:
                                chunk = wav_file.read(chunk_size)
                                if not chunk:
                                    break
                                yield chunk
                            
                    finally:
                        # Clean up temporary file
                        if os.path.exists(temp_filename):
                            try:
                                os.unlink(temp_filename)
                            except:
                                pass
                else:
                    raise Exception("No audio data received from Gemini TTS")
            else:
                raise Exception("No audio data received from Gemini TTS")
                
        except Exception as e:
            logger.error(f"Error generating tutor response audio: {e}", exc_info=True)
            raise
    
    async def generate_and_upload_explanation_audio(self, content: str, topic: str, filename: str) -> Dict[str, Any]:
        """Generate explanation audio and upload to Cloudinary"""
        try:
            # Collect all audio data
            audio_chunks = []
            used_minimax = False
            
            # Try Minimax first
            if MINIMAX_API_KEY:
                try:
                    logger.info("TTS: Attempting Minimax for explanation audio...")
                    async for chunk in generate_minimax_audio_async(content):
                        audio_chunks.append(chunk)
                    used_minimax = True
                    logger.info("TTS: Successfully generated audio using Minimax")
                except Exception as minimax_error:
                    logger.warning(f"TTS: Minimax failed: {minimax_error}. Falling back to Gemini...")
                    audio_chunks = []  # Reset chunks
            
            # Fallback to Gemini if Minimax failed or not configured
            if not used_minimax:
                if not self.client:
                    raise Exception("Neither Minimax nor Gemini client configured")
                
                logger.info("TTS: Using Gemini TTS as fallback...")
                # Call Gemini directly to avoid double-trying Minimax
                tts_text = content
                try:
                    response = self.client.models.generate_content(
                        model="gemini-2.5-flash-preview-tts",
                        contents=tts_text,
                        config=types.GenerateContentConfig(
                            response_modalities=["AUDIO"],
                            speech_config=types.SpeechConfig(
                                voice_config=types.VoiceConfig(
                                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                        voice_name="Kore"
                                    )
                                )
                            )
                        )
                    )
                    
                    # Extract audio data
                    if (response.candidates and 
                        response.candidates[0].content and 
                        response.candidates[0].content.parts):
                        
                        audio_part = None
                        for part in response.candidates[0].content.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                audio_part = part
                                break
                        
                        if audio_part and audio_part.inline_data:
                            inline_data = audio_part.inline_data
                            audio_data_b64 = inline_data.data
                            pcm_audio = base64.b64decode(audio_data_b64)
                            
                            # Create temporary WAV file
                            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                            temp_filename = temp_file.name
                            temp_file.close()
                            
                            try:
                                wave_file(temp_filename, pcm_audio, channels=1, rate=24000, sample_width=2)
                                with open(temp_filename, 'rb') as wav_file:
                                    audio_chunks.append(wav_file.read())
                            finally:
                                if os.path.exists(temp_filename):
                                    try:
                                        os.unlink(temp_filename)
                                    except:
                                        pass
                except Exception as gemini_error:
                    raise Exception(f"Gemini TTS failed: {str(gemini_error)}")
            
            # Combine chunks
            full_audio_data = b''.join(audio_chunks)
            
            # Determine file extension based on which service was used
            file_ext = '.mp3' if used_minimax else '.wav'
            
            # Create temporary file for upload
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_ext)
            temp_filename = temp_file.name
            temp_file.write(full_audio_data)
            temp_file.close()
            
            try:
                # Upload to Cloudinary
                cloudinary_options = {
                    "folder": "bookx/audio",
                    "public_id": f"explanation_{filename}"
                }
                cloudinary_result = upload_to_cloudinary(temp_filename, cloudinary_options)
                
                return {
                    "audio_url": cloudinary_result.get("secure_url"),
                    "audio_size": len(full_audio_data),
                    "success": True,
                    "provider": "minimax" if used_minimax else "gemini"
                }
            finally:
                # Clean up temporary file
                if os.path.exists(temp_filename):
                    try:
                        os.unlink(temp_filename)
                    except:
                        pass
            
        except Exception as e:
            logger.error(f"Error generating and uploading explanation audio: {e}", exc_info=True)
            return {
                "error": str(e),
                "success": False
            }


# Global service instance
gemini_tts_service = GeminiTTSService()

# Wrapper function for tool_router compatibility
def gemini_audio(text: str, voice_name: str = "Kore", voice_style: Optional[str] = None, 
                cloudinary_options: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Wrapper function for Gemini audio generation that matches the expected tool interface.
    
    Args:
        text: Text to convert to speech
        voice_name: Voice to use
        voice_style: Voice style enhancement
        cloudinary_options: Options for Cloudinary upload
        
    Returns:
        Dictionary with generation result
    """
    # Enhance text with voice style if provided
    enhanced_text = text
    if voice_style:
        enhanced_text = f"say {voice_style}: {text}"
    
    # Call the main generation function
    return generate_audio(enhanced_text, voice_name, cloudinary_options)
