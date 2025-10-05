# BookX Frontend

Next.js frontend for PDF management with AI analysis.

## Features

- Google OAuth authentication
- PDF upload with drag & drop
- Cloudinary integration
- AI-powered PDF analysis display
- Responsive design with TailwindCSS

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your actual values
```

3. Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` - Cloudinary upload preset

## Project Structure

- `app/` - Next.js app directory
- `app/components/` - React components
- `app/lib/` - Utility functions
- `app/page.js` - Main page component
- `app/layout.js` - Root layout component