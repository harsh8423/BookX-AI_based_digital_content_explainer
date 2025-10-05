# BookX - PDF Management System

A full-stack application for uploading, managing, and analyzing PDF documents using AI.

## Features

- **Frontend**: Next.js with React, TailwindCSS, and JavaScript
- **Backend**: FastAPI with Python
- **Database**: MongoDB
- **Authentication**: Google OAuth with JWT
- **File Storage**: Cloudinary
- **AI Analysis**: Google Gemini for PDF content analysis
- **File Limits**: 20MB max size, 1000 pages max

## Architecture

```
BookX/
├── frontend/          # Next.js React application
│   ├── app/          # App router structure
│   ├── components/   # React components
│   └── lib/          # Utility functions
├── backend/          # FastAPI Python application
│   ├── main.py       # FastAPI app entry point
│   ├── auth.py       # Authentication logic
│   ├── pdfs.py       # PDF management endpoints
│   ├── models.py     # Pydantic models
│   └── database.py   # MongoDB connection
└── utils/            # Existing utility files
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.8+
- MongoDB
- Google Cloud Console account (for OAuth)
- Cloudinary account
- Google AI Studio account (for Gemini API)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your actual values
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Run the FastAPI server:
```bash
python main.py
```

Backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your actual values
```

4. Run the development server:
```bash
npm run dev
```

Frontend will be available at `http://localhost:3000`

## Environment Variables

### Backend (.env)
- `MONGODB_URL` - MongoDB connection string
- `DATABASE_NAME` - Database name
- `JWT_SECRET_KEY` - JWT signing key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GEMINI_API_KEY` - Google Gemini API key

### Frontend (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` - Cloudinary upload preset

## API Endpoints

### Authentication
- `POST /auth/google` - Google OAuth login
- `POST /auth/logout` - Logout
- `GET /auth/verify` - Verify JWT token
- `GET /auth/me` - Get current user info

### PDF Management
- `POST /pdfs/upload` - Upload and analyze PDF
- `GET /pdfs/` - Get user's PDFs
- `GET /pdfs/{pdf_id}` - Get specific PDF
- `DELETE /pdfs/{pdf_id}` - Delete PDF

## Workflow

1. **User Authentication**: User signs in with Google OAuth
2. **PDF Upload**: User uploads PDF (max 20MB, 1000 pages)
3. **Cloudinary Storage**: PDF is uploaded to Cloudinary
4. **AI Analysis**: Gemini analyzes the PDF content
5. **Data Storage**: PDF metadata and analysis results are saved to MongoDB
6. **Display**: User can view uploaded PDFs with AI-generated titles, descriptions, and metadata

## Technologies Used

- **Frontend**: Next.js, React, TailwindCSS, JavaScript
- **Backend**: FastAPI, Python, Pydantic
- **Database**: MongoDB with Motor (async driver)
- **Authentication**: Google OAuth, JWT
- **File Storage**: Cloudinary
- **AI**: Google Gemini 2.0 Flash
- **HTTP Client**: httpx (async)

## Development

### Backend Development
```bash
cd backend
python main.py
```

### Frontend Development
```bash
cd frontend
npm run dev
```

### API Documentation
Visit `http://localhost:8000/docs` for interactive API documentation.

## License

MIT License