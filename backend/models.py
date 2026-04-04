"""
Pydantic Models / Schemas for the Sherlock AI Application
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from enum import Enum


# ─── Auth Models ───────────────────────────────────────────────

class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)
    username: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str = "user"
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefresh(BaseModel):
    refresh_token: str


# ─── Chat Models ───────────────────────────────────────────────

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    audio_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatCreate(BaseModel):
    title: Optional[str] = None
    initial_message: Optional[str] = None


class ChatResponse(BaseModel):
    id: str
    title: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message: Optional[str] = None


class ChatDetailResponse(BaseModel):
    id: str
    title: str
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime


# ─── Detection / AI Models ────────────────────────────────────

class DetectRequest(BaseModel):
    text: str = Field(..., min_length=5, max_length=5000, description="Crime description text")
    chat_id: Optional[str] = None


class DetectResponse(BaseModel):
    result: str
    chat_id: str
    processing_time: float


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    chat_id: Optional[str] = None


class ChatStreamResponse(BaseModel):
    content: str
    chat_id: str
    message_id: str
    done: bool = False


# ─── Voice Models ──────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: Optional[str] = None


class STTResponse(BaseModel):
    text: str
    confidence: float = 0.0


class LiveVoiceResponse(BaseModel):
    text_input: str
    ai_response: str
    audio_url: Optional[str] = None
    processing_time: float


# ─── Document Models ──────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    analysis: str
    created_at: datetime
    user_id: str


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


# ─── General ──────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    mongodb: str = "connected"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ErrorResponse(BaseModel):
    detail: str
    status_code: int = 400
