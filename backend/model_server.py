"""
Sherlock AI - Local Model Server
Runs the Kerala Crime Detective Gemma model locally
Exposes OpenAI-compatible API at /v1/chat/completions
Optimized for CPU with 8GB RAM
"""
import os
import gc
import logging
import time
from typing import List, Optional
from contextlib import asynccontextmanager

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from fastapi import FastAPI
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("model-server")

# Model configuration
MODEL_ID = os.getenv("MODEL_ID", "wincode/kerala-crime-detective-gemma")
MODEL_PORT = int(os.getenv("MODEL_PORT", "11434"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "512"))

# Global model and tokenizer
model = None
tokenizer = None


def load_model():
    """Load the model with CPU-optimized settings."""
    global model, tokenizer
    
    logger.info(f"Loading model: {MODEL_ID}")
    logger.info(f"Available RAM: {os.popen('free -h').read()}")
    start = time.time()
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID,
        trust_remote_code=True
    )
    
    # Load model in bfloat16 for memory efficiency (~2GB for 1B params)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        dtype=torch.bfloat16,
        device_map="cpu",
        low_cpu_mem_usage=True,
        trust_remote_code=True
    )
    model.eval()
    
    # Force garbage collection
    gc.collect()
    
    elapsed = time.time() - start
    logger.info(f"Model loaded in {elapsed:.1f}s")
    logger.info(f"Model parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M")
    logger.info(f"Memory after load: {os.popen('free -h').read()}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    load_model()
    yield
    logger.info("Shutting down model server")


app = FastAPI(
    title="Sherlock AI Model Server",
    description="Local Gemma model serving OpenAI-compatible API",
    version="1.0.0",
    lifespan=lifespan
)


# ─── Request/Response Models ─────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = MODEL_ID
    messages: List[ChatMessage]
    max_tokens: Optional[int] = MAX_NEW_TOKENS
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    repetition_penalty: Optional[float] = 1.1
    stream: Optional[bool] = False

class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"

class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class ChatCompletionResponse(BaseModel):
    id: str = "chatcmpl-local"
    object: str = "chat.completion"
    created: int = 0
    model: str = MODEL_ID
    choices: List[ChatCompletionChoice]
    usage: Usage


# ─── Inference Endpoint ──────────────────────────────────────

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint."""
    global model, tokenizer
    
    if model is None or tokenizer is None:
        return {"error": "Model not loaded yet"}, 503
    
    start_time = time.time()
    
    try:
        # Format messages for the model using chat template
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        
        # Apply chat template
        input_text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        # Tokenize
        inputs = tokenizer(
            input_text,
            return_tensors="pt",
            truncation=True,
            max_length=2048
        )
        input_ids = inputs["input_ids"]
        prompt_tokens = input_ids.shape[1]
        
        # Generate
        with torch.no_grad():
            outputs = model.generate(
                input_ids,
                max_new_tokens=min(request.max_tokens or MAX_NEW_TOKENS, MAX_NEW_TOKENS),
                temperature=max(request.temperature or 0.7, 0.01),
                top_p=request.top_p or 0.9,
                repetition_penalty=request.repetition_penalty or 1.1,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
        
        # Decode only the new tokens
        new_tokens = outputs[0][prompt_tokens:]
        generated_text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        completion_tokens = len(new_tokens)
        
        elapsed = time.time() - start_time
        tokens_per_sec = completion_tokens / elapsed if elapsed > 0 else 0
        logger.info(f"Generated {completion_tokens} tokens in {elapsed:.1f}s ({tokens_per_sec:.1f} tok/s)")
        
        # Clean up
        del inputs, outputs, new_tokens
        gc.collect()
        
        return ChatCompletionResponse(
            created=int(time.time()),
            model=request.model or MODEL_ID,
            choices=[
                ChatCompletionChoice(
                    message=ChatMessage(role="assistant", content=generated_text)
                )
            ],
            usage=Usage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens
            )
        )
    
    except Exception as e:
        logger.error(f"Inference error: {e}", exc_info=True)
        gc.collect()
        return {"error": str(e)}, 500


@app.get("/v1/models")
async def list_models():
    """List available models."""
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_ID,
                "object": "model",
                "owned_by": "local",
                "ready": model is not None
            }
        ]
    }


@app.get("/api/tags")
async def ollama_tags():
    """Ollama-compatible tags endpoint for health checks."""
    return {
        "models": [
            {
                "name": MODEL_ID,
                "modified_at": "2026-04-03T00:00:00Z",
                "size": 2000000000
            }
        ]
    }


@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "ok" if model is not None else "loading",
        "model": MODEL_ID,
        "device": "cpu"
    }


@app.get("/")
async def root():
    return {
        "service": "Sherlock AI Model Server",
        "model": MODEL_ID,
        "status": "ready" if model is not None else "loading",
        "api": "/v1/chat/completions"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "model_server:app",
        host="0.0.0.0",
        port=MODEL_PORT,
        workers=1,  # Single worker for CPU inference
        log_level="info"
    )
