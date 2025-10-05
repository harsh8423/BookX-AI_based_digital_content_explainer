import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from bson import ObjectId
from database import get_notes_collection
from models import Note, NoteCreate, NoteResponse, NotesBySectionResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NotesService:
    def __init__(self):
        pass
    
    async def create_note(self, note_data: NoteCreate) -> NoteResponse:
        """Create a new note"""
        try:
            notes_collection = await get_notes_collection()
            
            # Convert to Note model
            note = Note(**note_data.dict())
            
            # Insert into database
            result = await notes_collection.insert_one(note.dict(by_alias=True))
            
            # Fetch the created note
            created_note = await notes_collection.find_one({"_id": result.inserted_id})
            
            return self._convert_to_response(created_note)
            
        except Exception as e:
            logger.error(f"Error creating note: {e}")
            raise
    
    async def get_notes_by_pdf(self, pdf_id: str, user_id: str) -> List[NoteResponse]:
        """Get all notes for a specific PDF and user"""
        try:
            notes_collection = await get_notes_collection()
            
            cursor = notes_collection.find({
                "pdf_id": pdf_id,
                "created_by_user": user_id
            }).sort("created_at", -1)
            
            notes = []
            async for note in cursor:
                notes.append(self._convert_to_response(note))
            
            return notes
            
        except Exception as e:
            logger.error(f"Error getting notes by PDF: {e}")
            raise
    
    async def get_notes_by_section(self, pdf_id: str, user_id: str, section_title: str, subsection_title: Optional[str] = None) -> List[NoteResponse]:
        """Get notes for a specific section/subsection"""
        try:
            notes_collection = await get_notes_collection()
            
            query = {
                "pdf_id": pdf_id,
                "created_by_user": user_id,
                "section_title": section_title
            }
            
            if subsection_title:
                query["subsection_title"] = subsection_title
            
            cursor = notes_collection.find(query).sort("created_at", -1)
            
            notes = []
            async for note in cursor:
                notes.append(self._convert_to_response(note))
            
            return notes
            
        except Exception as e:
            logger.error(f"Error getting notes by section: {e}")
            raise
    
    async def get_notes_by_topic(self, pdf_id: str, user_id: str, topic: str) -> List[NoteResponse]:
        """Get notes for a specific topic"""
        try:
            notes_collection = await get_notes_collection()
            
            cursor = notes_collection.find({
                "pdf_id": pdf_id,
                "created_by_user": user_id,
                "topic": {"$regex": topic, "$options": "i"}  # Case-insensitive search
            }).sort("created_at", -1)
            
            notes = []
            async for note in cursor:
                notes.append(self._convert_to_response(note))
            
            return notes
            
        except Exception as e:
            logger.error(f"Error getting notes by topic: {e}")
            raise
    
    async def get_notes_grouped_by_section(self, pdf_id: str, user_id: str) -> List[NotesBySectionResponse]:
        """Get notes grouped by section for the notes tab"""
        try:
            notes_collection = await get_notes_collection()
            
            # Get all notes for the PDF
            cursor = notes_collection.find({
                "pdf_id": pdf_id,
                "created_by_user": user_id
            }).sort("created_at", -1)
            
            # Group notes by section
            sections = {}
            async for note in cursor:
                section_key = note.get("section_title", "Unknown Section")
                subsection_key = note.get("subsection_title")
                
                if section_key not in sections:
                    sections[section_key] = {}
                
                if subsection_key:
                    if subsection_key not in sections[section_key]:
                        sections[section_key][subsection_key] = []
                    sections[section_key][subsection_key].append(self._convert_to_response(note))
                else:
                    if "main" not in sections[section_key]:
                        sections[section_key]["main"] = []
                    sections[section_key]["main"].append(self._convert_to_response(note))
            
            # Convert to response format
            result = []
            for section_title, subsections in sections.items():
                for subsection_title, notes in subsections.items():
                    result.append(NotesBySectionResponse(
                        section_title=section_title,
                        subsection_title=subsection_title if subsection_title != "main" else None,
                        notes=notes,
                        total_notes=len(notes)
                    ))
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting notes grouped by section: {e}")
            raise
    
    async def check_existing_note(self, pdf_id: str, user_id: str, topic: str, section_title: Optional[str] = None, subsection_title: Optional[str] = None) -> Optional[NoteResponse]:
        """Check if a note already exists for the given parameters"""
        try:
            notes_collection = await get_notes_collection()
            
            query = {
                "pdf_id": pdf_id,
                "created_by_user": user_id,
                "topic": topic
            }
            
            if section_title:
                query["section_title"] = section_title
            if subsection_title:
                query["subsection_title"] = subsection_title
            
            existing_note = await notes_collection.find_one(query)
            
            if existing_note:
                return self._convert_to_response(existing_note)
            
            return None
            
        except Exception as e:
            logger.error(f"Error checking existing note: {e}")
            raise
    
    async def update_note(self, note_id: str, update_data: Dict[str, Any]) -> Optional[NoteResponse]:
        """Update an existing note"""
        try:
            notes_collection = await get_notes_collection()
            
            # Add updated_at timestamp
            update_data["updated_at"] = datetime.utcnow()
            
            result = await notes_collection.update_one(
                {"_id": ObjectId(note_id)},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                # Fetch updated note
                updated_note = await notes_collection.find_one({"_id": ObjectId(note_id)})
                return self._convert_to_response(updated_note)
            
            return None
            
        except Exception as e:
            logger.error(f"Error updating note: {e}")
            raise
    
    async def delete_note(self, note_id: str, user_id: str) -> bool:
        """Delete a note"""
        try:
            notes_collection = await get_notes_collection()
            
            result = await notes_collection.delete_one({
                "_id": ObjectId(note_id),
                "created_by_user": user_id
            })
            
            return result.deleted_count > 0
            
        except Exception as e:
            logger.error(f"Error deleting note: {e}")
            raise
    
    def _convert_to_response(self, note_dict: Dict[str, Any]) -> NoteResponse:
        """Convert database document to NoteResponse"""
        return NoteResponse(
            id=str(note_dict["_id"]),
            pdf_id=note_dict["pdf_id"],
            topic=note_dict["topic"],
            section_title=note_dict.get("section_title"),
            subsection_title=note_dict.get("subsection_title"),
            start_page=note_dict["start_page"],
            end_page=note_dict["end_page"],
            content_type=note_dict["content_type"],
            reading_content=note_dict["reading_content"],  # Added missing field
            text_content=note_dict["text_content"],
            audio_url=note_dict.get("audio_url"),
            audio_size=note_dict.get("audio_size"),
            important_points=note_dict.get("important_points"),
            short_notes=note_dict.get("short_notes"),
            created_by_user=note_dict["created_by_user"],
            created_at=note_dict["created_at"],
            updated_at=note_dict["updated_at"]
        )

# Global service instance
notes_service = NotesService()