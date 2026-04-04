"""
AI Service - Hybrid Hugging Face & Local Model Integration 
Handles crime analysis using the Kerala Crime Detective model
Tries Hugging Face API first, falls back to local VPS model 
"""
import logging
import time
from typing import Optional
import httpx
from config import settings

logger = logging.getLogger(__name__)

# Hugging Face API configuration
HF_API_URL = "https://router.huggingface.co/v1/chat/completions"
HF_HEADERS = {"Authorization": f"Bearer {settings.HF_TOKEN}", "Content-Type": "application/json"}

# Local VPS API configuration 
LOCAL_MODEL_URL = f"{settings.LOCAL_MODEL_BASE_URL}/v1/chat/completions"

# System prompt for Kerala Crime Detective
SYSTEM_PROMPT = """You are Sherlock AI, an advanced Kerala Crime Detective AI assistant. 
You are an expert in:
- Criminal investigation and forensic analysis
- Kerala Police procedures and Indian Penal Code (IPC)
- Crime pattern recognition and suspect profiling
- FIR (First Information Report) analysis
- Evidence collection and chain of custody
- Cybercrime investigation
- Drug trafficking patterns in Kerala
- Gold smuggling detection
- Financial fraud investigation

When given a crime description, provide:
1. 🔍 **Initial Assessment** - Nature and severity of the crime
2. 📋 **Investigation Steps** - Step-by-step investigation plan
3. 🕵️ **Suspect Profile** - Likely suspect characteristics
4. 📜 **Applicable Laws** - Relevant IPC sections and Kerala-specific laws
5. ⚡ **Immediate Actions** - What police should do first
6. 🔗 **Evidence to Collect** - Physical and digital evidence
7. 📊 **Risk Assessment** - Threat level and urgency

Always be thorough, professional, and follow proper police investigation protocols.
Respond in a clear, structured format with bullet points and sections.

CRITICAL DIALECT RULE: You MUST respond strictly in the exact language the user speaks to you in. If the user asks in Malayalam, or mentions Malayalam/Kerala, you MUST write your entire response natively in pure Malayalam characters. NEVER reply in Tamil. NEVER substitute Tamil for Malayalam.
"""


def format_gemma_messages(messages: list) -> list:
    """
    Gemma chat models enforce strictly alternating user/assistant roles
    and do not natively support the 'system' role in raw template arrays.
    This safely merges them.
    """
    merged = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        # Convert system roles to user messages implicitly
        if role == "system":
            role = "user"
            
        if not merged:
            merged.append({"role": role, "content": content})
        else:
            # If same role in a row, concatenate
            if merged[-1]["role"] == role:
                merged[-1]["content"] += f"\n\n{content}"
            else:
                merged.append({"role": role, "content": content})
                
    # Model template must always start with user
    if merged and merged[0]["role"] != "user":
        merged.insert(0, {"role": "user", "content": "Please continue analyzing."})
        
    return merged


async def query_huggingface(messages: list, max_tokens: int = 1024) -> Optional[str]:
    """
    Attempt to use the Hugging Face Serverless API first.
    Returns None if it fails.
    """
    if not settings.HF_TOKEN:
        logger.warning("No Hugging Face token found. Skipping HF API.")
        return None

    payload = {
        "model": settings.HF_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "top_p": 0.9,
    }

    try:
        logger.info("Attempting inference via Hugging Face API...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                HF_API_URL,
                json=payload,
                headers=HF_HEADERS
            )

            if response.status_code == 200:
                result = response.json()
                if "choices" in result and len(result["choices"]) > 0:
                    generated_text = result["choices"][0]["message"].get("content", "")
                    logger.info("Successfully received response from Hugging Face API.")
                    return generated_text.strip()
            else:
                logger.warning(f"HF API returned status {response.status_code}: {response.text}")
                return None

    except Exception as e:
        logger.error(f"HF API connection failed: {e}")
        return None


async def query_local_model(messages: list, max_tokens: int = 1024) -> Optional[str]:
    """
    Query the local deployed model on the VPS.
    Returns None if it completely fails.
    """
    payload = {
        "model": settings.LOCAL_MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "top_p": 0.9,
        "repetition_penalty": 1.1,
        "stream": False
    }

    try:
        logger.info(f"Attempting inference via Local VPS Model at {LOCAL_MODEL_URL}...")
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                LOCAL_MODEL_URL,
                json=payload
            )

            if response.status_code == 200:
                result = response.json()
                if "choices" in result and len(result["choices"]) > 0:
                    generated_text = result["choices"][0]["message"].get("content", "")
                    logger.info("Successfully received response from Local VPS Model.")
                    return generated_text.strip()
            elif response.status_code == 503:
                logger.warning("Local VPS model is still loading...")
            else:
                logger.error(f"Local model API error: {response.status_code} - {response.text}")

    except Exception as e:
        logger.error(f"Local VPS model connection failed: {e}")
        
    return None


async def stream_local_model(messages: list, max_tokens: int = 1024):
    """
    Query the local deployed model on the VPS and yield streaming chunks.
    """
    payload = {
        "model": settings.LOCAL_MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "top_p": 0.9,
        "repetition_penalty": 1.1,
        "stream": True
    }

    try:
        logger.info(f"Attempting STREMAING inference via Local VPS Model...")
        import json
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", LOCAL_MODEL_URL, json=payload) as response:
                if response.status_code != 200:
                    logger.error(f"Local model stream error: {response.status_code}")
                    yield f"Error: Local model unavailable (Status {response.status_code})"
                    return

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue
    except Exception as e:
        logger.error(f"Local VPS model stream failed: {e}")
        yield "An error occurred while connecting to the AI system."

def generate_local_analysis(prompt: str) -> str:
    """Fallback response when all APIs fail."""
    return f"""🔍 **Sherlock AI - Crime Analysis Report**

📝 **Case Input:** {prompt[:200]}...

📋 **Investigation Steps:**
1. Secure the crime scene and preserve evidence
2. Collect witness statements from the area
3. Review CCTV footage from nearby cameras
4. Check for fingerprints and forensic evidence
5. Cross-reference with known criminal databases
6. File FIR under appropriate IPC sections

🕵️ **Recommended Actions:**
- Alert local police station immediately
- Deploy forensic team to the scene

📜 **Note:** This is a preliminary template. Both remote and local AI models are currently unavailable. Please try again later.
"""


async def get_ai_response(messages: list, max_tokens: int = 1024) -> str:
    """
    Orchestrator to try HF first, then VPS local model, then fallback template.
    """
    safe_messages = format_gemma_messages(messages)
    
    # 1. Try Hugging Face
    response = await query_huggingface(safe_messages, max_tokens)
    if response:
        return response
        
    # 2. Try Local VPS Model
    response = await query_local_model(messages, max_tokens)
    if response:
        return response
        
    # 3. Last resort fallback
    return generate_local_analysis(str(messages))


async def analyze_crime(text: str) -> dict:
    """
    Main function to analyze a crime description.
    """
    start_time = time.time()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text}
    ]
    
    result = await get_ai_response(messages)
    processing_time = time.time() - start_time

    return {
        "result": result,
        "processing_time": round(processing_time, 2)
    }


async def chat_with_ai(messages: list, current_message: str) -> str:
    """
    Chat with AI using conversation history.
    """
    formatted_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in messages[-10:]:
        formatted_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", "")
        })
    formatted_messages.append({"role": "user", "content": current_message})

    # Skip fallback template for chat, return direct message
    safe_messages = format_gemma_messages(formatted_messages)
    
    # 1. Try Hugging Face
    response = await query_huggingface(safe_messages, max_tokens=1024)
    if response:
        return response
        
    # 2. Try Local VPS Model
    response = await query_local_model(safe_messages, max_tokens=1024)
    if response:
        return response
        
    return "I'm having trouble analyzing the chat right now (both cloud and local models are unavailable). Please tell me more about the incident."

async def chat_with_ai_stream(messages: list, current_message: str):
    """
    Chat with AI using conversation history, generating a live streaming output.
    Uses the local model natively.
    """
    formatted_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in messages[-10:]:
        formatted_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", "")
        })
    formatted_messages.append({"role": "user", "content": current_message})

    safe_messages = format_gemma_messages(formatted_messages)
    
    # Yield characters dynamically 
    async for chunk in stream_local_model(safe_messages, max_tokens=1024):
        yield chunk
