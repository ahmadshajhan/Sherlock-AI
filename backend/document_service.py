"""
Document Service - PDF and text file parsing and analysis
"""
import logging
import io
from datetime import datetime
from typing import Optional
from bson import ObjectId

from database import get_database
from ai_service import query_huggingface

logger = logging.getLogger(__name__)


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text content from a PDF file."""
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        text_parts = []

        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                text_parts.append(f"--- Page {page_num + 1} ---\n{text}")

        full_text = "\n\n".join(text_parts)
        logger.info(f"Extracted {len(full_text)} characters from PDF ({len(reader.pages)} pages)")
        return full_text

    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise Exception(f"Failed to extract text from PDF: {e}")


async def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extract text from various file types."""
    ext = filename.lower().split(".")[-1] if "." in filename else ""

    if ext == "pdf":
        return await extract_text_from_pdf(file_bytes)
    elif ext in ("txt", "text", "log", "csv"):
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1")
    elif ext in ("md", "markdown"):
        return file_bytes.decode("utf-8")
    else:
        raise Exception(f"Unsupported file type: .{ext}. Supported: PDF, TXT, CSV, MD")


async def analyze_document(text: str) -> str:
    """
    Analyze document content using the AI model.
    Specialized for FIR reports and crime-related documents.
    """
    prompt = f"""Analyze the following document content. This could be an FIR report, crime report, 
witness statement, or other law enforcement document. Provide:

1. 📄 **Document Summary** - Brief overview of the document
2. 🔍 **Key Findings** - Important details, names, dates, locations
3. 🎯 **Crime Classification** - Type of crime(s) identified
4. 📋 **Action Items** - Recommended next steps for investigation
5. ⚠️ **Red Flags** - Suspicious patterns or inconsistencies
6. 🔗 **Cross-References** - Connections to potential related cases

Document Content:
{text[:3000]}
"""

    return await query_huggingface(prompt)


async def save_document_analysis(
    user_id: str,
    filename: str,
    file_type: str,
    analysis: str
) -> dict:
    """Save document analysis to the database."""
    db = get_database()

    doc = {
        "user_id": user_id,
        "filename": filename,
        "file_type": file_type,
        "analysis": analysis,
        "created_at": datetime.utcnow()
    }

    result = await db.documents.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def get_user_documents(user_id: str, skip: int = 0, limit: int = 20) -> list:
    """Get all documents for a user."""
    db = get_database()

    cursor = db.documents.find(
        {"user_id": user_id}
    ).sort("created_at", -1).skip(skip).limit(limit)

    return await cursor.to_list(length=limit)


async def get_document_by_id(doc_id: str, user_id: str) -> Optional[dict]:
    """Get a specific document by ID."""
    db = get_database()

    return await db.documents.find_one({
        "_id": ObjectId(doc_id),
        "user_id": user_id
    })
