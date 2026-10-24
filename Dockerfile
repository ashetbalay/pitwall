FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv==0.12.15 && uv sync --frozen --no-dev
COPY backend ./backend
COPY frontend ./frontend
COPY alembic.ini ./
COPY migrations ./migrations
RUN useradd --create-home pitwall
USER pitwall
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD .venv/bin/python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD [".venv/bin/python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
