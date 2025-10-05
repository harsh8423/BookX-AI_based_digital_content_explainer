#!/usr/bin/env python3
"""
Test script to debug the content generation endpoint
"""

import asyncio
import os
import sys
import json
from dotenv import load_dotenv

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

async def test_content_generation():
    """Test the content generation functionality directly"""
    
    print("🧪 Testing Content Generation Endpoint")
    print("=" * 50)
    
    try:
        from content_service import content_service
        from database import get_database
        from bson import ObjectId
        
        # Get a test PDF from the database
        db = await get_database()
        pdf_collection = db["pdfs"]
        
        # Find a PDF with analysis completed
        pdf_doc = await pdf_collection.find_one({"analysis_status": "completed"})
        
        if not pdf_doc:
            print("❌ No PDF with completed analysis found in database")
            print("   Please upload and analyze a PDF first")
            return False
        
        pdf_id = str(pdf_doc["_id"])
        print(f"📄 Using PDF: {pdf_doc.get('filename', 'Unknown')} (ID: {pdf_id})")
        
        # Test content generation
        print("\n🔄 Testing content generation...")
        result = await content_service.generate_content(
            pdf_id=pdf_id,
            cloudinary_url=pdf_doc["cloudinary_url"],
            start_page=1,
            end_page=2,
            topic="Introduction",
            content_type="read"
        )
        
        if "error" in result:
            print(f"❌ Content generation failed: {result['error']}")
            return False
        
        print(f"✅ Content generated successfully")
        print(f"   Content length: {len(result.get('content', ''))}")
        print(f"   Content preview: {result.get('content', '')[:200]}...")
        
        # Test reading content extraction
        print("\n📖 Testing reading content extraction...")
        reading_content = await content_service.extract_reading_content(
            pdf_id=pdf_id,
            cloudinary_url=pdf_doc["cloudinary_url"],
            start_page=1,
            end_page=2
        )
        
        print(f"✅ Reading content extracted successfully")
        print(f"   Reading content length: {len(reading_content)}")
        print(f"   Reading content preview: {reading_content[:200]}...")
        
        # Test note creation
        print("\n📝 Testing note creation...")
        from models import NoteCreate
        from notes_service import notes_service
        
        note_data = NoteCreate(
            pdf_id=pdf_id,
            topic="Introduction",
            section_title="Test Section",
            subsection_title="Test Subsection",
            start_page=1,
            end_page=2,
            content_type="read",
            reading_content=reading_content,
            text_content=result["content"],
            audio_url=None,
            audio_size=None,
            important_points=[],
            short_notes="",
            created_by_user="test_user"
        )
        
        print("   Note data created successfully")
        print(f"   Reading content length: {len(note_data.reading_content)}")
        print(f"   Text content length: {len(note_data.text_content)}")
        
        # Try to create the note
        note = await notes_service.create_note(note_data)
        print(f"✅ Note created successfully: {note.id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function"""
    success = await test_content_generation()
    
    if success:
        print("\n✅ All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Tests failed!")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())