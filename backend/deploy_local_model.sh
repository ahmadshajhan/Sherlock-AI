#!/bin/bash
# ============================================================
# Sherlock AI - Full Local Model Deployment
# Installs model server with transformers on CPU
# ============================================================
set -e

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🔍 Sherlock AI - Local Model Deployment             ║"
echo "║  Setting up Gemma Model Server on CPU                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

MODEL_DIR="/opt/sherlock-model"
BACKEND_DIR="/opt/sherlock-ai"

# ─── Step 1: Create model server directory ────────────────────
echo -e "${YELLOW}[1/7] Creating model server directory...${NC}"
mkdir -p $MODEL_DIR
echo -e "${GREEN}  ✓ Directory created: $MODEL_DIR${NC}"

# ─── Step 2: Create Python venv for model server ──────────────
echo ""
echo -e "${YELLOW}[2/7] Setting up Python virtual environment...${NC}"
if [ ! -d "$MODEL_DIR/venv" ]; then
    python3 -m venv $MODEL_DIR/venv
    echo -e "${GREEN}  ✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}  ✓ Virtual environment already exists${NC}"
fi

# ─── Step 3: Install dependencies ────────────────────────────
echo ""
echo -e "${YELLOW}[3/7] Installing dependencies (this takes a few minutes)...${NC}"
$MODEL_DIR/venv/bin/pip install --upgrade pip setuptools wheel 2>&1 | tail -1

echo "  Installing PyTorch CPU..."
$MODEL_DIR/venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu 2>&1 | tail -3

echo "  Installing transformers, FastAPI, accelerate..."
$MODEL_DIR/venv/bin/pip install \
    transformers \
    accelerate \
    fastapi \
    uvicorn[standard] \
    huggingface_hub \
    sentencepiece \
    protobuf 2>&1 | tail -3

echo -e "${GREEN}  ✓ All dependencies installed${NC}"

# ─── Step 4: Download the model ──────────────────────────────
echo ""
echo -e "${YELLOW}[4/7] Pre-downloading model files...${NC}"
$MODEL_DIR/venv/bin/python3 -c "
from huggingface_hub import snapshot_download
import os
print('Downloading wincode/kerala-crime-detective-gemma...')
path = snapshot_download(
    'wincode/kerala-crime-detective-gemma',
    cache_dir='/opt/sherlock-model/model-cache'
)
print(f'Model downloaded to: {path}')
print('Files:')
for f in os.listdir(path):
    size = os.path.getsize(os.path.join(path, f))
    print(f'  {f} ({size/1024/1024:.1f} MB)')
"
echo -e "${GREEN}  ✓ Model downloaded${NC}"

# ─── Step 5: Copy model server script ────────────────────────
echo ""
echo -e "${YELLOW}[5/7] Installing model server script...${NC}"
# The model_server.py should already be copied by scp before running this script
if [ ! -f "$MODEL_DIR/model_server.py" ]; then
    echo -e "${RED}  ✗ model_server.py not found at $MODEL_DIR/model_server.py${NC}"
    echo "  Please copy it first: scp model_server.py root@server:$MODEL_DIR/"
    exit 1
fi
echo -e "${GREEN}  ✓ Model server script installed${NC}"

# ─── Step 6: Create systemd service ──────────────────────────
echo ""
echo -e "${YELLOW}[6/7] Creating systemd service...${NC}"

cat > /etc/systemd/system/sherlock-model.service << 'SERVICEEOF'
[Unit]
Description=Sherlock AI - Local Gemma Model Server
After=network.target
Documentation=https://github.com/wincode/sherlock-ai

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sherlock-model
Environment=PATH=/opt/sherlock-model/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=MODEL_ID=wincode/kerala-crime-detective-gemma
Environment=MODEL_PORT=11434
Environment=MAX_NEW_TOKENS=512
Environment=HF_HOME=/opt/sherlock-model/model-cache
Environment=TRANSFORMERS_CACHE=/opt/sherlock-model/model-cache
ExecStart=/opt/sherlock-model/venv/bin/uvicorn model_server:app --host 0.0.0.0 --port 11434 --workers 1
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Memory management for 8GB VPS
MemoryMax=6G
MemoryHigh=5G
OOMPolicy=continue

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
echo -e "${GREEN}  ✓ Systemd service created: sherlock-model.service${NC}"

# ─── Step 7: Start model server ──────────────────────────────
echo ""
echo -e "${YELLOW}[7/7] Starting model server...${NC}"
systemctl enable sherlock-model
systemctl restart sherlock-model

echo "  Waiting for model to load (this takes 30-60 seconds)..."
for i in {1..90}; do
    STATUS=$(curl -s http://localhost:11434/health 2>/dev/null || echo "")
    if echo "$STATUS" | grep -q '"ok"'; then
        echo -e "${GREEN}  ✓ Model server is READY!${NC}"
        break
    fi
    if [ $i -eq 90 ]; then
        echo -e "${YELLOW}  ⚠ Model still loading. Check: journalctl -u sherlock-model -f${NC}"
    fi
    sleep 2
    printf "\r  Loading... %ds" $((i*2))
done
echo ""

# ─── Update backend .env ─────────────────────────────────────
echo ""
echo -e "${YELLOW}Updating backend .env...${NC}"
if [ -f "$BACKEND_DIR/.env" ]; then
    # Add local model settings
    if grep -q "LOCAL_MODEL_BASE_URL" "$BACKEND_DIR/.env"; then
        sed -i 's|LOCAL_MODEL_BASE_URL=.*|LOCAL_MODEL_BASE_URL=http://localhost:11434|' "$BACKEND_DIR/.env"
    else
        echo "" >> "$BACKEND_DIR/.env"
        echo "# Local Model Server" >> "$BACKEND_DIR/.env"
        echo "LOCAL_MODEL_BASE_URL=http://localhost:11434" >> "$BACKEND_DIR/.env"
    fi
    
    if grep -q "LOCAL_MODEL_NAME" "$BACKEND_DIR/.env"; then
        sed -i 's|LOCAL_MODEL_NAME=.*|LOCAL_MODEL_NAME=wincode/kerala-crime-detective-gemma|' "$BACKEND_DIR/.env"
    else
        echo "LOCAL_MODEL_NAME=wincode/kerala-crime-detective-gemma" >> "$BACKEND_DIR/.env"
    fi
    echo -e "${GREEN}  ✓ Backend .env updated${NC}"
fi

# ─── Restart backend ─────────────────────────────────────────
echo ""
echo -e "${YELLOW}Restarting backend service...${NC}"
systemctl restart sherlock-ai
echo -e "${GREEN}  ✓ Backend restarted${NC}"

# ─── Final Status ────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE                              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  Model Server:  http://localhost:11434               ║"
echo "║  Backend API:   http://localhost:8000                ║"
echo "║  Model:         kerala-crime-detective-gemma (1B)    ║"
echo "║  Device:        CPU (bfloat16, ~2GB RAM)             ║"
echo "║                                                      ║"
echo "║  Services:                                           ║"
echo "║    sherlock-model  →  Model inference server         ║"
echo "║    sherlock-ai     →  Backend API                    ║"
echo "║                                                      ║"
echo "║  Logs:                                               ║"
echo "║    journalctl -u sherlock-model -f                   ║"
echo "║    journalctl -u sherlock-ai -f                      ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Quick test
echo "Running final test..."
curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wincode/kerala-crime-detective-gemma",
    "messages": [{"role": "user", "content": "Hello Sherlock"}],
    "max_tokens": 50
  }' | python3 -m json.tool 2>/dev/null || echo "Test will work once model has fully loaded."
