import os
import sys
import pickle
import json
from datetime import datetime, timedelta
from typing import List, Optional
import pandas as pd
import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import init_db, SessionLocal, PatientDailyLogDB, ChatMessageDB, \
    PatientDailyLogCreate, PatientDailyLogResponse, ChatMessageResponse, ChatRequest
from app.chatbot import generate_health_advice
from train_model import train_model

app = FastAPI(title="Clinivision AI Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
model_pipeline = None
master_data = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def load_model_and_data():
    global model_pipeline, master_data
    model_path = "d:/database/models/best_model.pkl"
    if os.path.exists(model_path):
        try:
            with open(model_path, "rb") as f:
                model_pipeline = pickle.load(f)
            print("ML model loaded successfully.")
        except Exception as e:
            print(f"Error loading ML model: {e}")
    master_path = "d:/database/datasets/master_dataset.csv"
    if os.path.exists(master_path):
        master_data = pd.read_csv(master_path)
        print(f"Master dataset loaded: {len(master_data)} patients.")

def seed_logs():
    db = SessionLocal()
    try:
        if db.query(PatientDailyLogDB).count() > 0:
            print("Logs already seeded.")
            return
        print("Seeding daily logs...")
        if master_data is not None:
            np.random.seed(99)
            today = datetime.now()
            for _, row in master_data.iterrows():
                pid = row["patient_id"]
                pnum = int(pid.replace("P", ""))
                np.random.seed(pnum)
                for i in range(14):
                    log_date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
                    base_sleep = 8.0 - (row["age"] * 0.02) + np.random.normal(0, 0.5)
                    base_water = 2500 - (row["bmi"] * 10) + np.random.normal(0, 300)
                    base_exercise = 45 if row["risk_level"] == "Low" else (20 if row["risk_level"] == "Medium" else 10)
                    log = PatientDailyLogDB(
                        patient_id=pid,
                        date=log_date,
                        water_intake_ml=int(np.clip(base_water, 800, 3500)),
                        sleep_hours=round(np.clip(base_sleep, 4.0, 9.5), 1),
                        exercise_minutes=int(np.clip(base_exercise + np.random.normal(0, 10), 0, 120)),
                        weight_kg=round(row["weight_kg"] + np.random.normal(0, 0.3), 1)
                    )
                    db.add(log)
            db.commit()
            print("Daily logs seeded for 14 days per patient.")
    except Exception as e:
        print(f"Error seeding logs: {e}")
        db.rollback()
    finally:
        db.close()

@app.on_event("startup")
def startup_event():
    init_db()
    load_model_and_data()
    seed_logs()

# ─────────────────────────────────────────────
# PUBLIC ENDPOINTS — No Auth Required
# ─────────────────────────────────────────────

@app.get("/api/patients")
def get_all_patients():
    if master_data is None:
        raise HTTPException(status_code=404, detail="No patient data loaded")
    records = master_data.to_dict(orient="records")
    return records

@app.get("/api/patients/{patient_id}")
def get_patient_profile(patient_id: str):
    if master_data is None:
        raise HTTPException(status_code=404, detail="No patient data")
    p_row = master_data[master_data["patient_id"] == patient_id]
    if p_row.empty:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p_row.iloc[0].to_dict()

@app.get("/api/patients/{patient_id}/predict")
def predict_patient_risk(patient_id: str):
    if model_pipeline is None or master_data is None:
        raise HTTPException(status_code=503, detail="Model unavailable")
    p_row = master_data[master_data["patient_id"] == patient_id]
    if p_row.empty:
        raise HTTPException(status_code=404, detail="Patient not found")
    p_data = p_row.iloc[0].to_dict()
    return _run_prediction(p_data)

@app.get("/api/patients/{patient_id}/logs")
def get_patient_logs(patient_id: str):
    db = SessionLocal()
    try:
        logs = db.query(PatientDailyLogDB).filter(
            PatientDailyLogDB.patient_id == patient_id
        ).order_by(PatientDailyLogDB.date.asc()).all()
        return [{"id": l.id, "patient_id": l.patient_id, "date": l.date,
                 "water_intake_ml": l.water_intake_ml, "sleep_hours": l.sleep_hours,
                 "exercise_minutes": l.exercise_minutes, "weight_kg": l.weight_kg} for l in logs]
    finally:
        db.close()

@app.post("/api/patients/{patient_id}/logs")
def add_patient_log(patient_id: str, log_data: PatientDailyLogCreate):
    db = SessionLocal()
    try:
        today_str = datetime.now().strftime("%Y-%m-%d")
        existing = db.query(PatientDailyLogDB).filter(
            PatientDailyLogDB.patient_id == patient_id,
            PatientDailyLogDB.date == today_str
        ).first()
        if existing:
            existing.water_intake_ml = log_data.water_intake_ml
            existing.sleep_hours = log_data.sleep_hours
            existing.exercise_minutes = log_data.exercise_minutes
            if log_data.weight_kg is not None:
                existing.weight_kg = log_data.weight_kg
            db.commit()
            db.refresh(existing)
            return {"id": existing.id, "patient_id": existing.patient_id, "date": existing.date,
                    "water_intake_ml": existing.water_intake_ml, "sleep_hours": existing.sleep_hours,
                    "exercise_minutes": existing.exercise_minutes, "weight_kg": existing.weight_kg}
        else:
            new_log = PatientDailyLogDB(
                patient_id=patient_id, date=today_str,
                water_intake_ml=log_data.water_intake_ml,
                sleep_hours=log_data.sleep_hours,
                exercise_minutes=log_data.exercise_minutes,
                weight_kg=log_data.weight_kg
            )
            db.add(new_log)
            db.commit()
            db.refresh(new_log)
            return {"id": new_log.id, "patient_id": new_log.patient_id, "date": new_log.date,
                    "water_intake_ml": new_log.water_intake_ml, "sleep_hours": new_log.sleep_hours,
                    "exercise_minutes": new_log.exercise_minutes, "weight_kg": new_log.weight_kg}
    finally:
        db.close()

@app.get("/api/patients/{patient_id}/chat")
def get_chat_history(patient_id: str):
    db = SessionLocal()
    try:
        msgs = db.query(ChatMessageDB).filter(
            ChatMessageDB.patient_id == patient_id
        ).order_by(ChatMessageDB.timestamp.asc()).all()
        return [{"sender": m.sender, "message": m.message, "timestamp": m.timestamp.isoformat()} for m in msgs]
    finally:
        db.close()

@app.post("/api/patients/{patient_id}/chat")
def chat_with_patient(patient_id: str, request: ChatRequest):
    if master_data is None:
        raise HTTPException(status_code=404, detail="No patient data")
    p_row = master_data[master_data["patient_id"] == patient_id]
    if p_row.empty:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient_info = p_row.iloc[0].to_dict()
    
    db = SessionLocal()
    try:
        history_records = db.query(ChatMessageDB).filter(
            ChatMessageDB.patient_id == patient_id
        ).order_by(ChatMessageDB.timestamp.desc()).limit(6).all()
        chat_history = [{"role": r.sender, "content": r.message} for r in reversed(history_records)]
        
        reply = generate_health_advice(patient_info, request.message, chat_history)
        
        user_msg = ChatMessageDB(patient_id=patient_id, sender="user", message=request.message)
        ai_msg = ChatMessageDB(patient_id=patient_id, sender="assistant", message=reply)
        db.add(user_msg)
        db.add(ai_msg)
        db.commit()
        return {"reply": reply}
    finally:
        db.close()

# ─────────────────────────────────────────────
# EXTERNAL PATIENT DATA PREDICTION ENDPOINT
# ─────────────────────────────────────────────

class ExternalPatientData(BaseModel):
    # Demographics
    age: float
    gender: str  # "Male" or "Female"
    smoking_status: str  # "Never", "Former", "Current"
    diabetes: str  # "Yes" or "No"
    hypertension: str  # "Yes" or "No"
    bmi: float
    height_m: Optional[float] = None
    weight_kg: Optional[float] = None
    # Vitals (averages)
    heart_rate_mean: float
    systolic_bp_mean: float
    diastolic_bp_mean: float
    temperature_mean: float
    spo2_mean: float
    # Optional std/min/max (will be estimated if missing)
    heart_rate_std: Optional[float] = None
    heart_rate_min: Optional[float] = None
    heart_rate_max: Optional[float] = None
    systolic_bp_std: Optional[float] = None
    systolic_bp_min: Optional[float] = None
    systolic_bp_max: Optional[float] = None
    diastolic_bp_std: Optional[float] = None
    diastolic_bp_min: Optional[float] = None
    diastolic_bp_max: Optional[float] = None
    temperature_std: Optional[float] = None
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    spo2_std: Optional[float] = None
    spo2_min: Optional[float] = None
    spo2_max: Optional[float] = None

@app.post("/api/predict/external")
def predict_external_patient(data: ExternalPatientData):
    if model_pipeline is None:
        raise HTTPException(status_code=503, detail="ML model unavailable")
    
    hr = data.heart_rate_mean
    sbp = data.systolic_bp_mean
    dbp = data.diastolic_bp_mean
    temp = data.temperature_mean
    spo2 = data.spo2_mean
    
    h = data.height_m if data.height_m else (1.76 if data.gender == "Male" else 1.63)
    w = data.weight_kg if data.weight_kg else data.bmi * (h ** 2)
    
    p_data = {
        "gender": data.gender,
        "smoking_status": data.smoking_status,
        "diabetes": data.diabetes,
        "hypertension": data.hypertension,
        "age": data.age,
        "bmi": data.bmi,
        "height_m": h,
        "weight_kg": w,
        "heart_rate_mean": hr,
        "heart_rate_std": data.heart_rate_std or 8.0,
        "heart_rate_min": data.heart_rate_min or (hr - 20),
        "heart_rate_max": data.heart_rate_max or (hr + 20),
        "systolic_bp_mean": sbp,
        "systolic_bp_std": data.systolic_bp_std or 12.0,
        "systolic_bp_min": data.systolic_bp_min or (sbp - 25),
        "systolic_bp_max": data.systolic_bp_max or (sbp + 25),
        "diastolic_bp_mean": dbp,
        "diastolic_bp_std": data.diastolic_bp_std or 8.0,
        "diastolic_bp_min": data.diastolic_bp_min or (dbp - 15),
        "diastolic_bp_max": data.diastolic_bp_max or (dbp + 15),
        "temperature_mean": temp,
        "temperature_std": data.temperature_std or 0.3,
        "temperature_min": data.temperature_min or (temp - 0.7),
        "temperature_max": data.temperature_max or (temp + 0.7),
        "spo2_mean": spo2,
        "spo2_std": data.spo2_std or 1.5,
        "spo2_min": data.spo2_min or (spo2 - 4),
        "spo2_max": data.spo2_max or min(100, spo2 + 3),
    }
    return _run_prediction(p_data)

def _run_prediction(p_data: dict):
    categorical_cols = ["gender", "smoking_status", "diabetes", "hypertension"]
    numerical_cols = ["age", "bmi", "height_m", "weight_kg"]
    vital_cols = [col for col in master_data.columns if any(
        v in col for v in ["heart_rate", "systolic_bp", "diastolic_bp", "temperature", "spo2"]
    )] if master_data is not None else [
        "heart_rate_mean","heart_rate_std","heart_rate_min","heart_rate_max",
        "systolic_bp_mean","systolic_bp_std","systolic_bp_min","systolic_bp_max",
        "diastolic_bp_mean","diastolic_bp_std","diastolic_bp_min","diastolic_bp_max",
        "temperature_mean","temperature_std","temperature_min","temperature_max",
        "spo2_mean","spo2_std","spo2_min","spo2_max",
    ]
    numerical_cols.extend(vital_cols)
    
    input_dict = {}
    for col in categorical_cols + numerical_cols:
        input_dict[col] = p_data.get(col, 0)
    input_df = pd.DataFrame([input_dict])
    
    try:
        pred_idx = model_pipeline.predict(input_df)[0]
        pred_probs = model_pipeline.predict_proba(input_df)[0]
        risk_labels = ["Low", "Medium", "High"]
        predicted_risk = risk_labels[pred_idx]
        confidence = float(pred_probs[pred_idx])
        all_probs = {risk_labels[i]: float(pred_probs[i]) for i in range(len(risk_labels))}
    except Exception as e:
        print(f"Prediction error: {e}")
        predicted_risk = p_data.get("risk_level", "Low")
        confidence = 0.80
        all_probs = {"Low": 0.70, "Medium": 0.20, "High": 0.10}
    
    # Build explanations
    contributions = []
    sys_bp = p_data.get("systolic_bp_mean", 120.0)
    if sys_bp >= 140:
        contributions.append({"feature":"Systolic BP","val":f"{sys_bp:.0f} mmHg","direction":"High","impact":"High","explanation":f"Systolic BP of {sys_bp:.0f} mmHg is in Stage 2 Hypertension range."})
    elif sys_bp >= 130:
        contributions.append({"feature":"Systolic BP","val":f"{sys_bp:.0f} mmHg","direction":"Elevated","impact":"Medium","explanation":f"Elevated systolic BP at {sys_bp:.0f} mmHg."})
    
    bmi_val = p_data.get("bmi", 24.0)
    if bmi_val >= 30.0:
        contributions.append({"feature":"BMI","val":f"{bmi_val:.1f}","direction":"High","impact":"High","explanation":f"BMI {bmi_val:.1f} indicates obesity, elevating metabolic risk."})
    elif bmi_val >= 25.0:
        contributions.append({"feature":"BMI","val":f"{bmi_val:.1f}","direction":"High","impact":"Medium","explanation":f"BMI {bmi_val:.1f} is in the overweight range."})
    
    if str(p_data.get("diabetes","No")).strip() == "Yes":
        contributions.append({"feature":"Diabetes","val":"Yes","direction":"Active","impact":"High","explanation":"Diabetes is a primary driver of cardiovascular risk."})
    if str(p_data.get("hypertension","No")).strip() == "Yes":
        contributions.append({"feature":"Hypertension","val":"Yes","direction":"Active","impact":"High","explanation":"Chronic hypertension increases arterial wall stress."})
    
    smoking = str(p_data.get("smoking_status","Never")).strip()
    if smoking == "Current":
        contributions.append({"feature":"Smoking","val":"Current","direction":"Active","impact":"High","explanation":"Active smoking reduces cardiovascular endurance and lung capacity."})
    elif smoking == "Former":
        contributions.append({"feature":"Smoking","val":"Former","direction":"History","impact":"Medium","explanation":"Past smoking history adds to baseline vascular risk."})
    
    spo2_val = p_data.get("spo2_mean", 98.0)
    if spo2_val < 95.0:
        contributions.append({"feature":"SpO2","val":f"{spo2_val:.1f}%","direction":"Low","impact":"High","explanation":f"SpO2 of {spo2_val:.1f}% suggests hypoxic conditions."})
    
    age_val = p_data.get("age", 45)
    if age_val >= 65:
        contributions.append({"feature":"Age","val":f"{age_val:.0f} yrs","direction":"Elevated","impact":"Medium","explanation":"Advanced age is an independent risk factor."})
    
    if not contributions:
        contributions.append({"feature":"Overall Profile","val":"Stable","direction":"Normal","impact":"Low","explanation":"All clinical parameters appear within normal ranges."})
    
    # Recommendations based on risk
    recommendations = _generate_recommendations(predicted_risk, p_data)
    
    return {
        "predicted_risk": predicted_risk,
        "confidence": confidence,
        "all_probabilities": all_probs,
        "explanations": contributions,
        "recommendations": recommendations
    }

def _generate_recommendations(risk_level: str, p_data: dict) -> dict:
    bmi = p_data.get("bmi", 24)
    diabetes = str(p_data.get("diabetes","No")).strip() == "Yes"
    hypertension = str(p_data.get("hypertension","No")).strip() == "Yes"
    smoking = str(p_data.get("smoking_status","Never")).strip()
    sys_bp = p_data.get("systolic_bp_mean", 120)
    
    diet = []
    exercise = []
    lifestyle = []
    medical = []
    
    if diabetes or bmi >= 25:
        diet.append("Adopt a low-glycemic index diet: whole grains, legumes, non-starchy vegetables.")
        diet.append("Limit added sugars, sugary drinks, white bread, and processed carbohydrates.")
    if hypertension or sys_bp >= 130:
        diet.append("Follow DASH diet: reduce sodium to <1500mg/day, increase potassium-rich foods.")
        diet.append("Reduce alcohol intake to <1 drink/day for women, <2 for men.")
    if bmi >= 25:
        diet.append("Create a caloric deficit of ~500 kcal/day for gradual weight loss.")
    diet.append("Eat 5+ servings of fruits and vegetables daily.")
    diet.append("Choose healthy fats: olive oil, avocado, nuts, fatty fish (omega-3).")
    
    if risk_level == "High":
        exercise.append("Start with supervised light cardio: 20-30 min walks, 3x per week.")
        exercise.append("Avoid high-intensity exercise without physician clearance.")
        exercise.append("Track heart rate during exercise — target 50-60% of max heart rate.")
    elif risk_level == "Medium":
        exercise.append("150 minutes of moderate aerobic activity weekly (brisk walking, cycling).")
        exercise.append("Add 2 days/week of light resistance training.")
        exercise.append("Include 10-minute stretching sessions post-workout.")
    else:
        exercise.append("Maintain 150-300 min/week of moderate aerobic activity.")
        exercise.append("Include 2-3 strength training sessions per week.")
        exercise.append("Stay active throughout the day — aim for 8,000+ steps daily.")
    
    lifestyle.append("Achieve 7-9 hours of quality sleep per night.")
    lifestyle.append("Practice stress-reduction: mindfulness, deep breathing, or yoga.")
    lifestyle.append("Drink 2.5-3 liters of water daily.")
    if smoking == "Current":
        lifestyle.append("⚠️ PRIORITY: Quit smoking immediately. Seek cessation counseling or NRT therapy.")
    lifestyle.append("Monitor weight weekly. Maintain a health journal.")
    
    if risk_level == "High":
        medical.append("Schedule monthly blood pressure and glucose checkups.")
        medical.append("Consult a cardiologist for a comprehensive cardiovascular assessment.")
        medical.append("Consider HbA1c testing if diabetic.")
        medical.append("Discuss medication adjustment with your physician.")
    elif risk_level == "Medium":
        medical.append("Quarterly vitals monitoring recommended.")
        medical.append("Annual lipid panel and kidney function tests.")
        medical.append("Discuss preventive medication options with your physician.")
    else:
        medical.append("Annual comprehensive health checkup.")
        medical.append("Maintain vaccinations and preventive screenings.")
    
    return {"diet": diet, "exercise": exercise, "lifestyle": lifestyle, "medical": medical}

@app.get("/api/admin/metrics")
def get_model_metrics():
    metrics_path = "d:/database/models/model_metrics.json"
    if not os.path.exists(metrics_path):
        raise HTTPException(status_code=404, detail="Metrics not found. Train the model first.")
    with open(metrics_path, "r") as f:
        return json.load(f)

@app.post("/api/admin/retrain")
def retrain_model():
    try:
        from data_pipeline import run_pipeline
        run_pipeline()
        train_model()
        load_model_and_data()
        return {"status": "success", "message": "Model retrained successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)