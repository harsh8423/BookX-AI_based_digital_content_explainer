from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.auth.transport import requests
from google.oauth2 import id_token
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional
import httpx
from dotenv import load_dotenv

from models import GoogleAuthRequest, AuthResponse, User, UserCreate, UserResponse
from database import get_users_collection

load_dotenv()

auth_router = APIRouter()
security = HTTPBearer()

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 3000

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

async def verify_google_token(token: str) -> dict:
    """Verify Google ID token and return user info"""
    try:
        print(f"DEBUG: GOOGLE_CLIENT_ID is set: {bool(GOOGLE_CLIENT_ID)}")
        print(f"DEBUG: Token length: {len(token) if token else 'None'}")
        print(f"DEBUG: Token preview: {token[:50] + '...' if token else 'None'}")
        
        if not GOOGLE_CLIENT_ID:
            print("ERROR: GOOGLE_CLIENT_ID environment variable is not set")
            raise ValueError("GOOGLE_CLIENT_ID environment variable is not set")
        
        # Verify the token with clock skew tolerance
        print("DEBUG: Attempting to verify Google token...")
        idinfo = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10  # Allow 10 seconds of clock skew
        )
        print(f"DEBUG: Token verification successful. Issuer: {idinfo.get('iss')}")
        
        # Verify the issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            print(f"ERROR: Wrong issuer: {idinfo['iss']}")
            raise ValueError('Wrong issuer.')
        
        print(f"DEBUG: User info extracted - Email: {idinfo.get('email')}, Name: {idinfo.get('name')}")
        return {
            'google_id': idinfo['sub'],
            'email': idinfo['email'],
            'name': idinfo['name'],
            'picture': idinfo.get('picture')
        }
    except ValueError as e:
        print(f"ERROR: ValueError in verify_google_token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )
    except Exception as e:
        print(f"ERROR: Unexpected error in verify_google_token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    users_collection = await get_users_collection()
    user_data = await users_collection.find_one({"google_id": user_id})
    
    if user_data is None:
        raise credentials_exception
    
    return User(**user_data)

@auth_router.post("/google", response_model=AuthResponse)
async def google_auth(request: GoogleAuthRequest):
    """Authenticate user with Google token"""
    try:
        print(f"DEBUG: Received Google auth request with token length: {len(request.token) if request.token else 'None'}")
        print(f"DEBUG: Request token preview: {request.token[:50] + '...' if request.token else 'None'}")
        
        # Verify Google token
        user_info = await verify_google_token(request.token)
        print(f"DEBUG: User info verified successfully: {user_info['email']}")
        
        # Get or create user in database
        users_collection = await get_users_collection()
        existing_user = await users_collection.find_one({"google_id": user_info['google_id']})
        
        if existing_user:
            user = User(**existing_user)
        else:
            # Create new user
            new_user = UserCreate(
                google_id=user_info['google_id'],
                email=user_info['email'],
                name=user_info['name'],
                picture=user_info.get('picture')
            )
            
            user_dict = new_user.dict()
            user_dict['created_at'] = datetime.utcnow()
            user_dict['updated_at'] = datetime.utcnow()
            
            result = await users_collection.insert_one(user_dict)
            user_dict['_id'] = result.inserted_id
            user = User(**user_dict)
        
        # Create JWT token
        access_token = create_access_token(data={"sub": user.google_id})
        
        # Create serializable user response
        user_response = UserResponse(
            id=str(user.id),
            google_id=user.google_id,
            email=user.email,
            name=user.name,
            picture=user.picture,
            created_at=user.created_at,
            updated_at=user.updated_at
        )
        
        return AuthResponse(
            user=user_response,
            access_token=access_token,
            token_type="bearer"
        )
        
    except Exception as e:
        print(f"ERROR: Exception in google_auth: {str(e)}")
        print(f"ERROR: Exception type: {type(e).__name__}")
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

@auth_router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout user (client-side token removal)"""
    return {"message": "Successfully logged out"}

@auth_router.get("/verify")
async def verify_token(current_user: User = Depends(get_current_user)):
    """Verify JWT token"""
    user_response = UserResponse(
        id=str(current_user.id),
        google_id=current_user.google_id,
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at
    )
    return {"valid": True, "user": user_response}

@auth_router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),
        google_id=current_user.google_id,
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at
    )