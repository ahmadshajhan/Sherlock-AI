FROM python:3.11-slim

# Set working directory safely
WORKDIR /app

# Install native compilation dependencies for python packages if purely necessary
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy strictly requirements to leverage Docker Layer caching
COPY requirements.txt .

# Install dependencies targeting CPU builds heavily to avoid downloading 4GB of CUDA cores
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY main.py .

# Expose internal fast api port
EXPOSE 5000

# Entrypoint via Uvicorn fully mapped to standard routing
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]
