import os
import gc
import logging
import asyncio
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# --- Configuration & Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalAI")

app = FastAPI(title="Sherlock AI Local Inference Service")

MODEL_ID = os.getenv("HF_MODEL", "wincode/kerala-crime-detective-gemma")
HF_TOKEN = os.getenv("HF_TOKEN")

if not HF_TOKEN:
    logger.warning("HF_TOKEN environment variable is not set. You may run into issues accessing private models.")

# Globals for the loaded model and tokenizer
model = None
tokenizer = None

# System prompt constraint
SYSTEM_PROMPT = """You are Sherlock AI, a Kerala crime detective assistant.
Analyze crime reports and respond with structured investigation insights,
including suspects, evidence, and next actions."""

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="List of previous conversation messages")
    max_tokens: int = Field(default=300, le=1024)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(default=1.1, ge=1.0)

# --- Server Lifecycle ---
@app.on_event("startup")
async def startup_event():
    global model, tokenizer
    logger.info(f"Loading tokenizer for {MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
    
    # Handle missing pad token universally causing memory leaks/crashes
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        
    logger.info(f"Loading {MODEL_ID} in bfloat16 on CPU for optimized RAM usage...")
    try:
        # Load entirely on CPU utilizing bfloat16 to fit beautifully in 8GB RAM 
        # (Typically a 2B model in bfloat16 uses ~4-5 GB)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            token=HF_TOKEN,
            device_map="cpu",
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True
        )
        model.eval()
        logger.info("Model securely loaded into memory.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        # Server will still start, but requests will throw 503 until it's fixed.

# --- API Endpoints ---
@app.get("/health")
def health_check():
    if model is None:
        return {"status": "error", "message": "Model not loaded"}
    return {"status": "ok", "model": MODEL_ID}

@app.post("/chat")
async def chat_endpoint(request: ChatRequest, fast_req: Request):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model is currently unavailable or loading.")

    # Validate input gracefully
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array cannot be empty.")
        
    # Prevent highly abusive memory-crashing prompts
    total_length = sum(len(m.content) for m in request.messages)
    if total_length > 15000:
        raise HTTPException(status_code=413, detail="Payload payload too large. Keep under 15,000 characters.")

    # Restructure messages to always forcefully align with System Constraints
    formatted_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in request.messages:
        if not str(msg.content).strip():
            raise HTTPException(status_code=400, detail="Message content cannot be completely empty.")
        formatted_messages.append({"role": msg.role, "content": msg.content})

    try:
        # Utilize Hugging Face's perfect chat templater
        logger.info("Applying chat template...")
        prompt = tokenizer.apply_chat_template(
            formatted_messages, 
            tokenize=False, 
            add_generation_prompt=True
        )
        
        inputs = tokenizer(prompt, return_tensors="pt", padding=True, truncation=True, max_length=2048)
        
        # Async generation logic specifically mapped to CPU using torch threads smoothly
        logger.info("Generating response...")
        # Since CPU generation can block the asyncio event loop, we run it in a thread executor
        loop = asyncio.get_event_loop()
        
        def run_generation():
            with torch.no_grad():
                return model.generate(
                    **inputs,
                    max_new_tokens=request.max_tokens,
                    temperature=request.temperature,
                    top_p=request.top_p,
                    repetition_penalty=request.repetition_penalty,
                    do_sample=True,
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id
                )
                
        output_ids = await asyncio.wait_for(loop.run_in_executor(None, run_generation), timeout=120.0)
        
        # Determine the length of the original prompt tokens to purely strip it from the output
        input_length = inputs.input_ids.shape[1]
        generated_tokens = output_ids[0][input_length:]
        
        response_text = tokenizer.decode(generated_tokens, skip_special_tokens=True)
        
        # Aggressively trigger Python's Garbage collection after generation 
        # to guarantee the server remains under the 8GB VPS limit.
        gc.collect()
        
        return {
            "model": MODEL_ID,
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": response_text.strip()
                }
            }]
        }
    
    except asyncio.TimeoutError:
        logger.error("Generation timed out.")
        raise HTTPException(status_code=504, detail="Execution timed out due to CPU processing constraints.")
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
