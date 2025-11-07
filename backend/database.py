"""
Database connection and configuration module
Handles MongoDB connections with SSL/TLS support
"""

# Standard library imports
import logging
import os

# Third-party imports
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# MongoDB connection configuration
MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "bookx")

# Global client
client = None
database = None

def _get_mongodb_options():
    """Get MongoDB connection options based on connection string type"""
    options = {}
    
    # Check if it's a local MongoDB connection (mongodb://) or cloud (mongodb+srv://)
    if MONGODB_URL and MONGODB_URL.startswith("mongodb://"):
        # Local MongoDB - disable SSL/TLS
        options["tls"] = False
        options["ssl"] = False
    elif MONGODB_URL and MONGODB_URL.startswith("mongodb+srv://"):
        # MongoDB Atlas - TLS is automatically enabled for mongodb+srv://
        # Try to use system certificates, but don't fail if there's an issue
        # We'll let it use default certificate validation first
        # If that fails, the error handler will retry with relaxed settings
        pass  # Use default TLS settings
    
    return options

async def get_database():
    global client, database
    if client is None:
        try:
            # Get connection options
            options = _get_mongodb_options()
            client = AsyncIOMotorClient(MONGODB_URL, **options)
            database = client[DATABASE_NAME]
            # Test the connection
            await client.admin.command('ping')
        except Exception as e:
            # If SSL context fails, try with relaxed SSL settings
            if "X509" in str(e) or "SSL" in str(e) or "cert" in str(e).lower():
                logger.warning(f"SSL context error, retrying with relaxed SSL settings: {e}")
                # For mongodb+srv://, TLS is automatically enabled, just allow invalid certs
                if MONGODB_URL and MONGODB_URL.startswith("mongodb+srv://"):
                    options = {"tlsAllowInvalidCertificates": True}
                else:
                    # For local MongoDB, disable TLS/SSL
                    options = {"tls": False, "ssl": False}
                client = AsyncIOMotorClient(MONGODB_URL, **options)
                database = client[DATABASE_NAME]
                await client.admin.command('ping')
                logger.info("Database connection established with relaxed SSL settings")
            else:
                logger.error(f"Database connection failed: {e}")
                raise
    return database

def get_sync_database():
    """Get synchronous database connection for operations that need it"""
    try:
        options = _get_mongodb_options()
        sync_client = MongoClient(MONGODB_URL, **options)
        sync_client.admin.command('ping')
        return sync_client[DATABASE_NAME]
    except Exception as e:
        # If SSL context fails, try with relaxed SSL settings
        if "X509" in str(e) or "SSL" in str(e) or "cert" in str(e).lower():
            logger.warning(f"SSL context error, retrying with relaxed SSL settings: {e}")
            # For mongodb+srv://, TLS is automatically enabled, just allow invalid certs
            if MONGODB_URL and MONGODB_URL.startswith("mongodb+srv://"):
                options = {"tlsAllowInvalidCertificates": True}
            else:
                # For local MongoDB, disable TLS/SSL
                options = {"tls": False, "ssl": False}
            sync_client = MongoClient(MONGODB_URL, **options)
            sync_client.admin.command('ping')
            logger.info("Synchronous database connection established with relaxed SSL settings")
            return sync_client[DATABASE_NAME]
        else:
            logger.error(f"Synchronous database connection failed: {e}")
            raise

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

async def get_explanations_collection():
    db = await get_database()
    return db.explanations