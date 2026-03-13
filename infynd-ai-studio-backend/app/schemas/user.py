from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordUpdate(BaseModel):
    new_password: str = Field(..., min_length=8)

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: Optional[UserResponse] = None
