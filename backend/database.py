"""
MongoDB Database Connection Module
Uses motor async driver for non-blocking MongoDB operations
"""
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger(__name__)

# Global database client and database references
client: AsyncIOMotorClient = None
db = None


async def connect_to_mongodb():
    """Initialize MongoDB connection on application startup."""
    global client, db
    try:
        client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = client[settings.MONGODB_DB_NAME]

        # Verify connection
        await client.admin.command("ping")
        logger.info(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")

        # Create indexes
        await create_indexes()
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        raise


async def create_indexes():
    """Create necessary database indexes for performance and uniqueness."""
    # Users collection - unique email
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)

    # Chats collection - index by user_id for fast lookup
    await db.chats.create_index("user_id")
    await db.chats.create_index("created_at")

    # Messages collection - index by chat_id
    await db.messages.create_index("chat_id")
    await db.messages.create_index("created_at")

    # Documents collection - index by user_id
    await db.documents.create_index("user_id")

    logger.info("✅ Database indexes created")


async def close_mongodb_connection():
    """Close MongoDB connection on application shutdown."""
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed")


def get_database():
    """Get the database instance."""
    return db


def get_collection(name: str):
    """Get a specific collection by name."""
    return db[name]
