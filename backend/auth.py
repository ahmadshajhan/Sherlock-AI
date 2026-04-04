"""
Authentication Service
Handles user registration, login, JWT tokens, and Google OAuth
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import httpx

from config import settings
from database import get_database
from models import (
    UserRegister, UserLogin, UserResponse, TokenResponse,
    TokenRefresh, ErrorResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ─── Request Models ────────────────────────────────────────────

class GoogleMobileAuth(BaseModel):
    id_token: str


# ─── Utility Functions ─────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Dependency to get the current authenticated user."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_database()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


async def get_optional_user(token: str = Depends(oauth2_scheme)) -> Optional[dict]:
    """Dependency for optional authentication."""
    if not token:
        return None
    try:
        return await get_current_user(token)
    except HTTPException:
        return None


def user_to_response(user: dict) -> UserResponse:
    """Convert MongoDB user document to response model."""
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user.get("full_name", ""),
        username=user.get("username"),
        avatar_url=user.get("avatar_url"),
        role=user.get("role", "user"),
        created_at=user.get("created_at", datetime.utcnow())
    )


# ─── Routes ────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    """Register a new user with email and password."""
    db = get_database()

    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user document
    user_doc = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "username": user_data.username,
        "avatar_url": None,
        "role": "user",
        "auth_provider": "email",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    # Generate tokens
    access_token = create_access_token({"sub": str(result.inserted_id)})
    refresh_token = create_refresh_token({"sub": str(result.inserted_id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_to_response(user_doc)
    )


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    """Login with email and password."""
    db = get_database()

    user = await db.users.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please login with Google")

    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate tokens
    access_token = create_access_token({"sub": str(user["_id"])})
    refresh_token = create_refresh_token({"sub": str(user["_id"])})

    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_to_response(user)
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: TokenRefresh):
    """Refresh access token using refresh token."""
    payload = decode_token(data.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    db = get_database()
    user = await db.users.find_one({"_id": ObjectId(user_id)})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token({"sub": user_id})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=user_to_response(user)
    )


@router.get("/google")
async def google_login(redirect_scheme: Optional[str] = None):
    """Redirect user to Google OAuth consent screen."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    import urllib.parse
    state_param = f"&state={urllib.parse.quote(redirect_scheme)}" if redirect_scheme else ""

    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={settings.GOOGLE_REDIRECT_URI}&"
        "response_type=code&"
        "scope=openid email profile&"
        "access_type=offline&"
        "prompt=consent"
        f"{state_param}"
    )
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(code: str, request: Request, state: Optional[str] = None):
    """Handle Google OAuth callback."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            }
        )

        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange Google token")

        tokens = token_response.json()

        # Get user info
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get Google user info")

        google_user = userinfo_response.json()
    token_response = await _create_or_update_google_user(google_user)

    if state:
        # Redirect back to mobile deep link with tokens
        import urllib.parse
        safe_url = f"{state}?access_token={token_response.access_token}&refresh_token={token_response.refresh_token}"
        return RedirectResponse(url=safe_url)
        
    return token_response


@router.post("/google/mobile", response_model=TokenResponse)
async def google_mobile_signin(data: GoogleMobileAuth):
    """
    Handle Google Sign-In from mobile app.
    Accepts an ID token from the mobile app, verifies it with Google,
    and returns JWT tokens.
    """
    # Verify the ID token with Google
    async with httpx.AsyncClient() as client:
        # Use Google's tokeninfo endpoint to verify
        verify_response = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={data.id_token}"
        )

        if verify_response.status_code != 200:
            logger.error(f"Google token verification failed: {verify_response.text}")
            raise HTTPException(status_code=401, detail="Invalid Google ID token")

        token_info = verify_response.json()

        # Verify the audience matches our client ID(s)
        aud = token_info.get("aud", "")
        valid_client_ids = [
            settings.GOOGLE_ANDROID_CLIENT_ID,
            settings.GOOGLE_CLIENT_ID,
        ]
        # Filter out empty strings
        valid_client_ids = [cid for cid in valid_client_ids if cid]

        if aud not in valid_client_ids:
            logger.error(f"Token audience mismatch: {aud} not in {valid_client_ids}")
            raise HTTPException(status_code=401, detail="Token audience mismatch")

        # Extract user info from token
        google_user = {
            "id": token_info.get("sub"),
            "email": token_info.get("email"),
            "name": token_info.get("name", token_info.get("email", "").split("@")[0]),
            "picture": token_info.get("picture"),
            "email_verified": token_info.get("email_verified") == "true",
        }

        if not google_user["email"]:
            raise HTTPException(status_code=400, detail="Email not found in Google token")

    return await _create_or_update_google_user(google_user)


async def _create_or_update_google_user(google_user: dict) -> TokenResponse:
    """Create or update a user from Google OAuth data and return tokens."""
    db = get_database()

    # Find or create user
    user = await db.users.find_one({"email": google_user["email"]})

    if not user:
        user_doc = {
            "email": google_user["email"],
            "full_name": google_user.get("name", ""),
            "username": google_user.get("email", "").split("@")[0],
            "avatar_url": google_user.get("picture"),
            "role": "user",
            "auth_provider": "google",
            "google_id": google_user.get("id"),
            "password_hash": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = await db.users.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id
        user = user_doc
    else:
        # Update Google info
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "avatar_url": google_user.get("picture"),
                "google_id": google_user.get("id"),
                "last_login": datetime.utcnow(),
            }}
        )

    # Generate JWT tokens
    access_token = create_access_token({"sub": str(user["_id"])})
    refresh_token = create_refresh_token({"sub": str(user["_id"])})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_to_response(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user information."""
    return user_to_response(user)
