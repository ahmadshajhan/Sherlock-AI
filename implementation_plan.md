# Local Model Deployment Plan (CPU-Optimized)

The goal is to transition the `kerala-crime-detective-gemma` model from external Hugging Face API calls to a locally hosted, self-contained inference engine natively running directly on your Ubuntu VPS. This guarantees 100% reliance on your model without API rate limits or lack of service availability.

## ⚠️ User Review Required: BitsAndBytes on CPU
You explicitly requested `bitsandbytes` 4-bit quantization alongside "Ensure it works on CPU (no GPU required)". 
> [!WARNING]
> **Technical Limitation:** Standard `transformers` + `bitsandbytes` (`load_in_4bit=True`) **strictly requires a CUDA-enabled GPU**. It will crash on a pure CPU machine.

**The Solution for 8GB CPU VPS:**
Since your model is likely the Gemma 2B variant, loading the model in `torch.bfloat16` precision will consume roughly **4.5 GB of RAM**. Your server has 8GB, making this completely viable for CPU without breaking anything. 
I will design the code to gracefully attempt typical CPU loading (`bfloat16`) to maximize memory efficiency safely within your 8GB limit. If you *really* want true 4-bit CPU quantization in the future, the industry standard is to convert the model to GGUF format and run it via `llama-cpp-python` (rather than `transformers`). I will use `transformers` as requested.

## Proposed Changes

### `main.py` (or replacement for `ai_service.py`)
A standalone FastAPI service script that handles:
- **Model Loading:** Safely initializes `transformers.AutoModelForCausalLM` and `AutoTokenizer`.
- **Memory Optimization:** Uses `torch.bfloat16`, explicit garbage collection, and model mapping. 
- **Endpoint:** Exposes `POST /chat`.
- **Formatting:** Uses `tokenizer.apply_chat_template()` for perfect prompt structures.
- **Constraints:** Enforces the Kerala Crime Detective system prompt, `max_new_tokens=300`, and `repetition_penalty=1.1`.

### `requirements.txt`
Minimal footprint dependencies:
- `fastapi`
- `uvicorn`
- `transformers`
- `torch` (CPU-only variant to save disk space)
- `accelerate` (For smart memory handling)

### `deployment_instructions.sh` & `local-ai.service`
- Command list for creating the Python virtual environment and installing CPU PyTorch.
- Systemd configuration file to continuously run the model locally.
- Keep-alive and system resource configurations.

## Open Questions

1. Do you want me to write this local model code straight into your existing `backend/ai_service.py` to seamlessly execute, or do you want me to generate a completely separate `main.py` standalone folder/script for you to run as an independent microservice?
2. Are you comfortable with `torch.bfloat16` loading to fit the 8GB limit instead of bitsandbytes (due to the CPU hardware)? 

## Verification Plan
1. Send curl tests against the newly implemented local FastAPI endpoint.
2. Monitor `htop` or memory metrics to ensure the load stays underneath 8GB RAM preventing OOM termination.
