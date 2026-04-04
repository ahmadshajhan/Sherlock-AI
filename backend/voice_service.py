"""
Voice Service - ElevenLabs TTS + Speech-to-Text
Handles text-to-speech conversion and audio processing
"""
import logging
import io
import base64
import tempfile
import os
from typing import Optional
import httpx
from config import settings

logger = logging.getLogger(__name__)

# ElevenLabs configuration
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"


async def text_to_speech(
    text: str,
    voice_id: Optional[str] = None,
    model_id: str = "eleven_monolingual_v1"
) -> bytes:
    """
    Convert text to speech using ElevenLabs API.
    Returns audio bytes (MP3 format).
    """
    voice = voice_id or settings.ELEVENLABS_VOICE_ID

    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": settings.ELEVENLABS_API_KEY
    }

    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.5,
            "use_speaker_boost": True
        }
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 200:
                logger.info(f"TTS generated successfully ({len(response.content)} bytes)")
                return response.content
            else:
                logger.error(f"ElevenLabs TTS error: {response.status_code} - {response.text}")
                raise Exception(f"TTS failed: {response.status_code}")

    except httpx.TimeoutException:
        logger.error("ElevenLabs TTS timeout")
        raise Exception("TTS service timeout")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise


async def text_to_speech_stream(
    text: str,
    voice_id: Optional[str] = None
):
    """
    Stream text-to-speech audio from ElevenLabs.
    Yields audio chunks for real-time playback.
    """
    voice = voice_id or settings.ELEVENLABS_VOICE_ID
    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice}/stream"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": settings.ELEVENLABS_API_KEY
    }

    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as response:
            if response.status_code == 200:
                async for chunk in response.aiter_bytes(chunk_size=1024):
                    yield chunk
            else:
                raise Exception(f"TTS streaming failed: {response.status_code}")


async def get_available_voices() -> list:
    """
    Get list of available voices from ElevenLabs.
    """
    url = f"{ELEVENLABS_BASE_URL}/voices"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                voices = data.get("voices", [])
                return [
                    {
                        "voice_id": v["voice_id"],
                        "name": v["name"],
                        "category": v.get("category", "unknown"),
                        "preview_url": v.get("preview_url")
                    }
                    for v in voices
                ]
            else:
                logger.error(f"Failed to get voices: {response.status_code}")
                return []

    except Exception as e:
        logger.error(f"Error getting voices: {e}")
        return []


async def speech_to_text_from_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """
    Convert speech audio to text.
    Uses a simple approach - saves to temp file and processes.
    For production, consider using Google Speech-to-Text or Whisper API.
    """
    try:
        # Save audio to temp file
        suffix = os.path.splitext(filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Try using speech_recognition library
            import speech_recognition as sr
            recognizer = sr.Recognizer()

            with sr.AudioFile(tmp_path) as source:
                audio = recognizer.record(source)

            # Use Google's free speech recognition
            text = recognizer.recognize_google(audio)
            return text

        except ImportError:
            logger.warning("speech_recognition not available, using HF Whisper")
            return await stt_via_huggingface(audio_bytes)

        except Exception as e:
            logger.error(f"Speech recognition error: {e}")
            return await stt_via_huggingface(audio_bytes)

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"STT error: {e}")
        raise Exception(f"Speech-to-text failed: {e}")


async def stt_via_huggingface(audio_bytes: bytes) -> str:
    """
    Fallback STT using Hugging Face Whisper model.
    """
    url = "https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo"
    headers = {"Authorization": f"Bearer {settings.HF_TOKEN}"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                content=audio_bytes,
                headers={**headers, "Content-Type": "audio/wav"}
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("text", "")
            else:
                logger.error(f"HF STT error: {response.status_code}")
                return ""

    except Exception as e:
        logger.error(f"HF STT error: {e}")
        return ""
