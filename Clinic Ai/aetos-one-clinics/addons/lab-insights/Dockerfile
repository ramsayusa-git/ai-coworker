FROM python:3.12-slim
WORKDIR /addon
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY addon.yaml .
EXPOSE 8108
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8108"]
