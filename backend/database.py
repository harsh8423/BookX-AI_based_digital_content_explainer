from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "bookx")

# Global client
client = None
database = None

async def get_database():
    global client, database
    if client is None:
        client = AsyncIOMotorClient(MONGODB_URL)
        database = client[DATABASE_NAME]
    return database

def get_sync_database():
    """Get synchronous database connection for operations that need it"""
    sync_client = MongoClient(MONGODB_URL)
    return sync_client[DATABASE_NAME]

# Collections
async def get_users_collection():
    db = await get_database()
    return db.users

async def get_pdfs_collection():
    db = await get_database()
    return db.pdfs

async def get_notes_collection():
    db = await get_database()
    return db.notes

async def get_flashcards_collection():
    db = await get_database()
    return db.flashcards

async def get_quizzes_collection():
    db = await get_database()
    return db.quizzes

async def get_quiz_attempts_collection():
    db = await get_database()
    return db.quiz_attempts