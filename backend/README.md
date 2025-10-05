# BookX Backend API

FastAPI backend for PDF management with AI analysis using Gemini.

## Features

- Google OAuth authentication with JWT
- PDF upload to Cloudinary
- AI-powered PDF analysis using Gemini
- MongoDB data storage
- RESTful API endpoints

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your actual values
```

3. Start MongoDB (if running locally):
```bash
mongod
```

4. Run the server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Authentication
- `POST /auth/google` - Google OAuth login
- `POST /auth/logout` - Logout
- `GET /auth/verify` - Verify JWT token
- `GET /auth/me` - Get current user info

### PDFs
- `POST /pdfs/upload` - Upload and analyze PDF
- `GET /pdfs/` - Get user's PDFs
- `GET /pdfs/{pdf_id}` - Get specific PDF
- `DELETE /pdfs/{pdf_id}` - Delete PDF

## Environment Variables

- `MONGODB_URL` - MongoDB connection string
- `DATABASE_NAME` - Database name
- `JWT_SECRET_KEY` - JWT signing key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GEMINI_API_KEY` - Google Gemini API key