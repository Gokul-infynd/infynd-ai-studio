# /Dockerfile (in root folder)
FROM python:3.11-slim

# 1. Install system utilities and Node.js 18
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. Inject uv directly into the container
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 3. Set the main working directory
WORKDIR /app

# 4. Copy your entire project into the container
COPY . .

# 5. SETUP FRONTEND
WORKDIR /app/infynd-ai-studio-frontend
RUN npm i
RUN npm run build

# 6. SETUP BACKEND
WORKDIR /app/infynd-ai-studio-backend
# Install the priority lists we cleaned up earlier
RUN uv pip install --system --no-cache -r clean_services.txt
RUN uv pip install --system --no-cache -r clean_backend.txt
# Install Playwright and its Chromium dependencies
RUN playwright install --with-deps chromium

# 7. FINAL SETUP
WORKDIR /app
# Make the startup script executable
RUN chmod +x start.sh

# Expose both ports
EXPOSE 3000 8000

# Command to run both servers
CMD ["./start.sh"]