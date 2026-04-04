"""
Chat Service - CRUD operations for chat conversations and messages
"""
import logging
from datetime import datetime
from typing import Optional, List
from bson import ObjectId
from database import get_database

logger = logging.getLogger(__name__)


async def create_chat(user_id: str, title: Optional[str] = None) -> dict:
    """Create a new chat conversation."""
    db = get_database()

    chat_doc = {
        "user_id": user_id,
        "title": title or "New Investigation",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "message_count": 0,
        "last_message": None
    }

    result = await db.chats.insert_one(chat_doc)
    chat_doc["_id"] = result.inserted_id
    return chat_doc


async def get_user_chats(user_id: str, skip: int = 0, limit: int = 50) -> List[dict]:
    """Get all chats for a user, ordered by most recent."""
    db = get_database()

    cursor = db.chats.find(
        {"user_id": user_id}
    ).sort("updated_at", -1).skip(skip).limit(limit)

    chats = await cursor.to_list(length=limit)
    return chats


async def get_chat_by_id(chat_id: str, user_id: str) -> Optional[dict]:
    """Get a specific chat by ID, verifying user ownership."""
    db = get_database()

    chat = await db.chats.find_one({
        "_id": ObjectId(chat_id),
        "user_id": user_id
    })
    return chat


async def delete_chat(chat_id: str, user_id: str) -> bool:
    """Delete a chat and all its messages."""
    db = get_database()

    # Verify ownership
    chat = await db.chats.find_one({
        "_id": ObjectId(chat_id),
        "user_id": user_id
    })

    if not chat:
        return False

    # Delete all messages in the chat
    await db.messages.delete_many({"chat_id": chat_id})

    # Delete the chat
    await db.chats.delete_one({"_id": ObjectId(chat_id)})

    return True


async def add_message(
    chat_id: str,
    role: str,
    content: str,
    audio_url: Optional[str] = None
) -> dict:
    """Add a message to a chat conversation."""
    db = get_database()

    message_doc = {
        "chat_id": chat_id,
        "role": role,
        "content": content,
        "audio_url": audio_url,
        "created_at": datetime.utcnow()
    }

    result = await db.messages.insert_one(message_doc)
    message_doc["_id"] = result.inserted_id

    # Update chat metadata
    await db.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "updated_at": datetime.utcnow(),
                "last_message": content[:100]
            },
            "$inc": {"message_count": 1}
        }
    )

    return message_doc


async def get_chat_messages(chat_id: str, skip: int = 0, limit: int = 100) -> List[dict]:
    """Get all messages in a chat, ordered chronologically."""
    db = get_database()

    cursor = db.messages.find(
        {"chat_id": chat_id}
    ).sort("created_at", 1).skip(skip).limit(limit)

    messages = await cursor.to_list(length=limit)
    return messages


async def update_chat_title(chat_id: str, title: str) -> bool:
    """Update the title of a chat."""
    db = get_database()

    result = await db.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"title": title, "updated_at": datetime.utcnow()}}
    )

    return result.modified_count > 0


async def generate_chat_title(first_message: str) -> str:
    """Generate a short title from the first message."""
    # Simple title generation - take first 50 chars
    title = first_message.strip()[:50]
    if len(first_message) > 50:
        title += "..."
    return title or "New Investigation"
