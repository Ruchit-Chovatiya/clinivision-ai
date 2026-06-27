from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# Database Setup
DATABASE_URL = "sqlite:///d:/database/clinivision.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy Models
class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)  # "patient", "doctor", "admin"
    patient_id = Column(String, nullable=True)  # Links to demographic patient ID if patient

class PatientDailyLogDB(Base):
    __tablename__ = "patient_daily_logs"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, index=True)
    date = Column(String, index=True)  # YYYY-MM-DD
    water_intake_ml = Column(Integer, default=0)
    sleep_hours = Column(Float, default=0.0)
    exercise_minutes = Column(Integer, default=0)
    weight_kg = Column(Float, nullable=True)

class ChatMessageDB(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, index=True)
    sender = Column(String)  # "user" or "assistant"
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class UserSignup(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "patient"  # "patient" or "doctor"
    patient_id: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    patient_id: Optional[str] = None
    username: str

class PatientDailyLogCreate(BaseModel):
    water_intake_ml: int
    sleep_hours: float
    exercise_minutes: int
    weight_kg: Optional[float] = None

class PatientDailyLogResponse(BaseModel):
    id: int
    patient_id: str
    date: str
    water_intake_ml: int
    sleep_hours: float
    exercise_minutes: int
    weight_kg: Optional[float] = None
    class Config:
        from_attributes = True

class ChatMessageResponse(BaseModel):
    sender: str
    message: str
    timestamp: datetime
    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
