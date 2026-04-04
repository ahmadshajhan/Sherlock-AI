"""
Sherlock AI - Kerala Crime Detective API
Main application entry point with all routes
"""
import logging
import time
import base64
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, JSONResponse
from bson import ObjectId

from config import settings
from database import connect_to_mongodb, close_mongodb_connection, get_database
from auth import router as auth_router, get_current_user, get_optional_user
from ai_service import analyze_crime, chat_with_ai, chat_with_ai_stream, query_huggingface
from voice_service import text_to_speech, text_to_speech_stream, speech_to_text_from_audio, get_available_voices
from chat_service import (
    create_chat, get_user_chats, get_chat_by_id, delete_chat,
    add_message, get_chat_messages, generate_chat_title, update_chat_title
)
from document_service import (
    extract_text_from_file, analyze_document,
    save_document_analysis, get_user_documents, get_document_by_id
)
from models import (
    DetectRequest, DetectResponse, ChatRequest,
    TTSRequest, STTResponse, LiveVoiceResponse,
    ChatResponse, ChatDetailResponse, ChatMessage, ChatCreate,
    DocumentResponse, DocumentListResponse,
    HealthResponse, ErrorResponse
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🔍 Starting Sherlock AI Backend...")
    await connect_to_mongodb()
    logger.info("✅ Sherlock AI Backend started successfully!")
    yield
    # Shutdown
    await close_mongodb_connection()
    logger.info("Sherlock AI Backend shut down")


# Create FastAPI app
app = FastAPI(
    title="Sherlock AI - Kerala Crime Detective",
    description="AI-powered crime investigation assistant for Kerala Police",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
origins = settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth router
app.include_router(auth_router)


# ─── Health Check ──────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint to verify the API is running."""
    db_status = "connected"
    try:
        db = get_database()
        await db.command("ping")
    except Exception:
        db_status = "disconnected"

    return HealthResponse(
        status="ok",
        version="1.0.0",
        mongodb=db_status,
        timestamp=datetime.utcnow()
    )


@app.get("/", tags=["System"])
async def root():
    """Root endpoint."""
    return {
        "app": "Sherlock AI",
        "version": "1.0.0",
        "description": "Kerala Crime Detective AI - Powered by Local Gemma Model & ElevenLabs",
        "docs": "/docs",
        "health": "/health"
    }


# ─── Crime Detection / Analysis ──────────────────────────────

@app.post("/detect", response_model=DetectResponse, tags=["Crime Analysis"])
async def detect_crime(
    request: DetectRequest,
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Analyze a crime description using AI.
    Returns investigation insights, suspect profiles, and action plans.
    """
    start_time = time.time()

    # If user is authenticated and chat_id provided, save to chat
    chat_id = request.chat_id
    if user and not chat_id:
        chat = await create_chat(
            user_id=str(user["_id"]),
            title=await generate_chat_title(request.text)
        )
        chat_id = str(chat["_id"])

    # Analyze the crime
    analysis = await analyze_crime(request.text)

    # Save messages to chat if authenticated
    if user and chat_id:
        await add_message(chat_id, "user", request.text)
        await add_message(chat_id, "assistant", analysis["result"])

    processing_time = time.time() - start_time

    return DetectResponse(
        result=analysis["result"],
        chat_id=chat_id or "",
        processing_time=round(processing_time, 2)
    )


# ─── Chat Endpoints ──────────────────────────────────────────

@app.post("/chat", tags=["Chat"])
async def send_chat_message(
    request: ChatRequest,
    user: dict = Depends(get_current_user)
):
    """Send a chat message and get AI response."""
    user_id = str(user["_id"])
    start_time = time.time()

    # Get or create chat
    chat_id = request.chat_id
    if chat_id:
        chat = await get_chat_by_id(chat_id, user_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")
    else:
        title = await generate_chat_title(request.message)
        chat = await create_chat(user_id, title)
        chat_id = str(chat["_id"])

    # Save user message
    await add_message(chat_id, "user", request.message)

    # Get conversation history
    messages = await get_chat_messages(chat_id)
    history = [{"role": m["role"], "content": m["content"]} for m in messages]

    # Get AI response
    ai_response = await chat_with_ai(history, request.message)

    # Save AI response
    await add_message(chat_id, "assistant", ai_response)

    processing_time = time.time() - start_time

    return {
        "content": ai_response,
        "chat_id": chat_id,
        "processing_time": round(processing_time, 2)
    }

@app.post("/chat/stream", tags=["Chat"])
async def stream_chat_message(
    request: ChatRequest,
    user: dict = Depends(get_current_user)
):
    """Send a chat message and stream the AI response."""
    user_id = str(user["_id"])
    
    # Get or create chat eagerly so we have the ID prior to stream
    chat_id = request.chat_id
    if chat_id:
        chat = await get_chat_by_id(chat_id, user_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")
    else:
        title = await generate_chat_title(request.message)
        chat = await create_chat(user_id, title)
        chat_id = str(chat["_id"])

    # Save user message
    await add_message(chat_id, "user", request.message)

    # Get conversation history
    messages = await get_chat_messages(chat_id)
    history = [{"role": m["role"], "content": m["content"]} for m in messages]

    async def event_generator():
        yield f"data: {{\"chat_id\": \"{chat_id}\"}}\\n\\n"
        
        full_response = ""
        try:
            async for chunk in chat_with_ai_stream(history, request.message):
                import json
                full_response += chunk
                safe_chunk = json.dumps({"text": chunk})
                yield f"data: {safe_chunk}\\n\\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {{\"error\": \"{str(e)}\"}}\\n\\n"
            
        yield "data: [DONE]\\n\\n"
        
        # Save AI response completely AFTER stream is done
        if full_response:
            await add_message(chat_id, "assistant", full_response)

    return StreamingResponse(event_generator(), media_type="text/event-stream")



@app.get("/chat/history", tags=["Chat"])
async def get_chat_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    """Get all chat conversations for the current user."""
    user_id = str(user["_id"])
    chats = await get_user_chats(user_id, skip, limit)

    return {
        "chats": [
            {
                "id": str(chat["_id"]),
                "title": chat.get("title", "Untitled"),
                "created_at": chat.get("created_at"),
                "updated_at": chat.get("updated_at"),
                "message_count": chat.get("message_count", 0),
                "last_message": chat.get("last_message")
            }
            for chat in chats
        ],
        "total": len(chats)
    }


@app.get("/chat/{chat_id}", tags=["Chat"])
async def get_chat_detail(
    chat_id: str,
    user: dict = Depends(get_current_user)
):
    """Get all messages in a specific chat."""
    user_id = str(user["_id"])
    chat = await get_chat_by_id(chat_id, user_id)

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = await get_chat_messages(chat_id)

    return {
        "id": str(chat["_id"]),
        "title": chat.get("title", "Untitled"),
        "messages": [
            {
                "role": msg["role"],
                "content": msg["content"],
                "audio_url": msg.get("audio_url"),
                "created_at": msg.get("created_at")
            }
            for msg in messages
        ],
        "created_at": chat.get("created_at"),
        "updated_at": chat.get("updated_at")
    }


@app.delete("/chat/{chat_id}", tags=["Chat"])
async def delete_chat_endpoint(
    chat_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete a chat conversation and all its messages."""
    user_id = str(user["_id"])
    success = await delete_chat(chat_id, user_id)

    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")

    return {"message": "Chat deleted successfully"}


@app.post("/chat/new", tags=["Chat"])
async def create_new_chat(
    data: ChatCreate,
    user: dict = Depends(get_current_user)
):
    """Create a new empty chat conversation."""
    user_id = str(user["_id"])
    chat = await create_chat(user_id, data.title)

    return {
        "id": str(chat["_id"]),
        "title": chat["title"],
        "created_at": chat["created_at"]
    }


# ─── Voice Endpoints ─────────────────────────────────────────

@app.post("/tts", tags=["Voice"])
async def text_to_speech_endpoint(request: TTSRequest):
    """
    Convert text to speech using ElevenLabs.
    Returns audio file (MP3).
    """
    try:
        audio_bytes = await text_to_speech(
            text=request.text,
            voice_id=request.voice_id
        )

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=sherlock_response.mp3"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


@app.post("/tts/stream", tags=["Voice"])
async def tts_stream_endpoint(request: TTSRequest):
    """
    Stream text-to-speech audio from ElevenLabs.
    Returns streaming MP3 audio.
    """
    try:
        return StreamingResponse(
            text_to_speech_stream(request.text, request.voice_id),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=sherlock_stream.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS streaming failed: {str(e)}")


@app.post("/voice", tags=["Voice"])
async def speech_to_text_endpoint(
    audio: UploadFile = File(..., description="Audio file (WAV, MP3, WEBM)")
):
    """
    Convert uploaded speech audio to text.
    Accepts WAV, MP3, or WEBM audio files.
    """
    try:
        audio_bytes = await audio.read()
        text = await speech_to_text_from_audio(audio_bytes, audio.filename or "audio.wav")

        return STTResponse(
            text=text,
            confidence=0.9
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT failed: {str(e)}")


@app.post("/voice/live", tags=["Voice"])
async def live_voice_chat(
    audio: UploadFile = File(...),
    chat_id: Optional[str] = Form(None),
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Full voice chat pipeline:
    1. Speech-to-Text (audio input)
    2. AI Processing (crime analysis)
    3. Text-to-Speech (audio response)
    
    Returns both text and audio response.
    """
    start_time = time.time()

    try:
        # Step 1: STT
        audio_bytes = await audio.read()
        user_text = await speech_to_text_from_audio(audio_bytes, audio.filename or "audio.wav")

        if not user_text:
            raise HTTPException(status_code=400, detail="Could not understand the audio")

        # Step 2: AI Processing
        if user and chat_id:
            messages = await get_chat_messages(chat_id)
            history = [{"role": m["role"], "content": m["content"]} for m in messages]
            ai_response = await chat_with_ai(history, user_text)
            await add_message(chat_id, "user", user_text)
            await add_message(chat_id, "assistant", ai_response)
        else:
            analysis = await analyze_crime(user_text)
            ai_response = analysis["result"]

        # Step 3: TTS
        try:
            tts_audio = await text_to_speech(ai_response[:500])  # Limit TTS length
            audio_base64 = base64.b64encode(tts_audio).decode("utf-8")
        except Exception as e:
            logger.warning(f"TTS failed, returning text only: {e}")
            audio_base64 = None

        processing_time = time.time() - start_time

        return {
            "text_input": user_text,
            "ai_response": ai_response,
            "audio_base64": audio_base64,
            "processing_time": round(processing_time, 2)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice chat failed: {str(e)}")


@app.get("/voices", tags=["Voice"])
async def list_voices():
    """Get available ElevenLabs voices."""
    voices = await get_available_voices()
    return {"voices": voices}


# ─── Document Endpoints ──────────────────────────────────────

@app.post("/document", tags=["Documents"])
async def upload_document(
    file: UploadFile = File(..., description="PDF or text file to analyze"),
    user: dict = Depends(get_current_user)
):
    """
    Upload and analyze a document (PDF, TXT, CSV, MD).
    Extracts text and performs AI-powered crime analysis.
    """
    user_id = str(user["_id"])

    # Validate file type
    allowed_types = {"pdf", "txt", "text", "csv", "md", "markdown", "log"}
    ext = (file.filename or "").lower().split(".")[-1] if file.filename and "." in file.filename else ""

    if ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Supported: {', '.join(allowed_types)}"
        )

    try:
        # Read file
        file_bytes = await file.read()

        # Extract text
        text = await extract_text_from_file(file_bytes, file.filename or "document.txt")

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text could be extracted from the file")

        # Analyze with AI
        analysis = await analyze_document(text)

        # Save to database
        doc = await save_document_analysis(
            user_id=user_id,
            filename=file.filename or "unknown",
            file_type=ext,
            analysis=analysis
        )

        return DocumentResponse(
            id=str(doc["_id"]),
            filename=doc["filename"],
            file_type=doc["file_type"],
            analysis=doc["analysis"],
            created_at=doc["created_at"],
            user_id=user_id
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")


@app.get("/documents", tags=["Documents"])
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user)
):
    """Get all analyzed documents for the current user."""
    user_id = str(user["_id"])
    docs = await get_user_documents(user_id, skip, limit)

    return DocumentListResponse(
        documents=[
            DocumentResponse(
                id=str(doc["_id"]),
                filename=doc["filename"],
                file_type=doc["file_type"],
                analysis=doc["analysis"],
                created_at=doc["created_at"],
                user_id=user_id
            )
            for doc in docs
        ],
        total=len(docs)
    )


@app.get("/document/{doc_id}", tags=["Documents"])
async def get_document(
    doc_id: str,
    user: dict = Depends(get_current_user)
):
    """Get a specific document analysis by ID."""
    user_id = str(user["_id"])
    doc = await get_document_by_id(doc_id, user_id)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse(
        id=str(doc["_id"]),
        filename=doc["filename"],
        file_type=doc["file_type"],
        analysis=doc["analysis"],
        created_at=doc["created_at"],
        user_id=user_id
    )


# ─── Run the server ──────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True,
        log_level="info"
    )
