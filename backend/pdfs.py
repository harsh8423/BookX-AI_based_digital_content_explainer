from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response, Query
from fastapi.responses import StreamingResponse
from typing import List
from datetime import datetime
import os
import asyncio
from dotenv import load_dotenv
import io

from models import PDF, PDFCreate, PDFUploadRequest, PDFUploadResponse, PDFMetadata, PDFResponse, PDFIndexContent
from database import get_pdfs_collection
from auth import get_current_user, User
from gemini_service import gemini_service
from content_service import content_service

load_dotenv()

pdf_router = APIRouter()

async def extract_pdf_index_background(pdf_id: str, cloudinary_url: str, filename: str):
    """Background task to extract PDF index content"""
    try:
        from bson import ObjectId
        
        # Update status to analyzing
        pdfs_collection = await get_pdfs_collection()
        await pdfs_collection.update_one(
            {"_id": ObjectId(pdf_id)},
            {"$set": {"analysis_status": "analyzing", "updated_at": datetime.utcnow()}}
        )
        
        # Extract index content
        index_result = await gemini_service.extract_pdf_index_content(cloudinary_url, filename)
        
        # Update with results
        index_content = PDFIndexContent(**index_result)
        await pdfs_collection.update_one(
            {"_id": ObjectId(pdf_id)},
            {"$set": {
                "analysis_status": "completed",
                "index_content": index_content.dict(),
                "updated_at": datetime.utcnow()
            }}
        )
        
        print(f"PDF index extraction completed for {pdf_id}")
        
    except Exception as e:
        print(f"Error in background PDF index extraction for {pdf_id}: {e}")
        # Update status to failed
        try:
            pdfs_collection = await get_pdfs_collection()
            await pdfs_collection.update_one(
                {"_id": ObjectId(pdf_id)},
                {"$set": {"analysis_status": "failed", "updated_at": datetime.utcnow()}}
            )
        except Exception as update_error:
            print(f"Failed to update error status: {update_error}")

@pdf_router.post("/process", response_model=PDFUploadResponse)
async def process_pdf(
    request: PDFUploadRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Process uploaded PDF from Cloudinary and analyze with Gemini"""
    try:
        # Validate file size (20MB limit)
        if request.size > 25 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds 20MB limit"
            )
        
        # Analyze PDF with Gemini
        analysis_result = await gemini_service.analyze_pdf(
            request.cloudinary_url, 
            request.filename
        )

        print("analysis_result from gemini: ",analysis_result)
        
        # Create PDF document
        pdf_data = PDFCreate(
            filename=request.filename,
            title=analysis_result.get('title', request.filename),
            description=analysis_result.get('description', ''),
            cloudinary_url=request.cloudinary_url,
            public_id=request.public_id,
            size=request.size,
            user_id=str(current_user.id),
            metadata=PDFMetadata(**analysis_result.get('metadata', {})),
            analysis_status="pending"
        )
        
        # Save to database
        pdfs_collection = await get_pdfs_collection()
        pdf_dict = pdf_data.dict()
        pdf_dict['created_at'] = datetime.utcnow()
        pdf_dict['updated_at'] = datetime.utcnow()
        
        result = await pdfs_collection.insert_one(pdf_dict)
        pdf_id = str(result.inserted_id)
        
        # Start background task for index content extraction
        background_tasks.add_task(
            extract_pdf_index_background,
            pdf_id,
            request.cloudinary_url,
            request.filename
        )
        
        return PDFUploadResponse(
            id=pdf_id,
            title=analysis_result.get('title', request.filename),
            description=analysis_result.get('description', ''),
            metadata=PDFMetadata(**analysis_result.get('metadata', {})),
            analysis_status="pending",
            message="PDF uploaded and analyzed successfully. Content analysis in progress..."
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )

@pdf_router.get("/", response_model=List[PDFResponse])
async def get_user_pdfs(current_user: User = Depends(get_current_user)):
    """Get all PDFs for the current user"""
    try:
        pdfs_collection = await get_pdfs_collection()
        cursor = pdfs_collection.find({"user_id": str(current_user.id)}).sort("created_at", -1)
        pdfs = []
        
        async for pdf_doc in cursor:
            pdf_response = PDFResponse(
                id=str(pdf_doc['_id']),
                filename=pdf_doc['filename'],
                title=pdf_doc.get('title'),
                description=pdf_doc.get('description'),
                cloudinary_url=pdf_doc['cloudinary_url'],
                public_id=pdf_doc['public_id'],
                size=pdf_doc['size'],
                user_id=pdf_doc['user_id'],
                metadata=pdf_doc.get('metadata'),
                analysis_status=pdf_doc.get('analysis_status', 'pending'),
                index_content=pdf_doc.get('index_content'),
                created_at=pdf_doc['created_at'],
                updated_at=pdf_doc['updated_at']
            )
            pdfs.append(pdf_response)
        
        return pdfs
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch PDFs: {str(e)}"
        )

@pdf_router.get("/{pdf_id}/pages", response_class=Response)
async def get_pdf_pages(
    pdf_id: str,
    start_page: int = Query(..., ge=1, description="Starting page number (1-indexed)"),
    end_page: int = Query(..., ge=1, description="Ending page number (1-indexed)"),
    current_user: User = Depends(get_current_user)
):
    """Extract and return specific PDF pages as a PDF file"""
    try:
        from bson import ObjectId
        
        # Get PDF document
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        # Load PDF and extract pages
        pdf_doc_obj = await content_service.load_pdf(pdf_id, pdf_doc['cloudinary_url'])
        
        # Validate page range
        if start_page < 1 or end_page > len(pdf_doc_obj) or start_page > end_page:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid page range. PDF has {len(pdf_doc_obj)} pages."
            )
        
        # Extract pages as PDF bytes
        extracted_pdf_bytes = content_service._extract_pages_as_pdf(pdf_doc_obj, start_page, end_page)
        
        # Return as PDF file
        return Response(
            content=extracted_pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=pages_{start_page}_{end_page}.pdf"
            }
        )
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract PDF pages: {str(e)}"
        )

@pdf_router.get("/{pdf_id}", response_model=PDFResponse)
async def get_pdf(
    pdf_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific PDF by ID"""
    try:
        from bson import ObjectId
        
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        return PDFResponse(
            id=str(pdf_doc['_id']),
            filename=pdf_doc['filename'],
            title=pdf_doc.get('title'),
            description=pdf_doc.get('description'),
            cloudinary_url=pdf_doc['cloudinary_url'],
            public_id=pdf_doc['public_id'],
            size=pdf_doc['size'],
            user_id=pdf_doc['user_id'],
            metadata=pdf_doc.get('metadata'),
            analysis_status=pdf_doc.get('analysis_status', 'pending'),
            index_content=pdf_doc.get('index_content'),
            created_at=pdf_doc['created_at'],
            updated_at=pdf_doc['updated_at']
        )
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch PDF: {str(e)}"
        )

@pdf_router.delete("/{pdf_id}")
async def delete_pdf(
    pdf_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a PDF"""
    try:
        from bson import ObjectId
        
        pdfs_collection = await get_pdfs_collection()
        result = await pdfs_collection.delete_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        return {"message": "PDF deleted successfully"}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete PDF: {str(e)}"
        )

@pdf_router.post("/{pdf_id}/analyze")
async def analyze_pdf_content(
    pdf_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Trigger PDF index content extraction"""
    try:
        from bson import ObjectId
        
        pdfs_collection = await get_pdfs_collection()
        pdf_doc = await pdfs_collection.find_one({
            "_id": ObjectId(pdf_id),
            "user_id": str(current_user.id)
        })
        
        if not pdf_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        # Check if already analyzing or completed
        current_status = pdf_doc.get('analysis_status', 'pending')
        if current_status in ['analyzing', 'completed']:
            return {
                "message": f"PDF analysis is already {current_status}",
                "status": current_status
            }
        
        # Start background task for index content extraction
        background_tasks.add_task(
            extract_pdf_index_background,
            pdf_id,
            pdf_doc['cloudinary_url'],
            pdf_doc['filename']
        )
        
        return {
            "message": "PDF content analysis started",
            "status": "analyzing"
        }
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start analysis: {str(e)}"
        )
