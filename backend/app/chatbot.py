import os
import requests

def query_llm(prompt: str, system_prompt: str) -> str:
    """
    Attempts to call an OpenAI-compatible endpoint using request library.
    Falls back to None if API key is missing or request fails.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
        
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7
    }
    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
    except Exception:
        pass
    return None

def generate_health_advice(patient_data: dict, user_message: str, chat_history: list = None) -> str:
    """
    Generates health-aware replies.
    Utilizes LLM if API is set up, otherwise falls back to a smart, clinical rule-based expert system.
    """
    # 1. Prepare clinical facts for context
    patient_id = patient_data.get("patient_id", "Patient")
    age = patient_data.get("age", 45)
    gender = patient_data.get("gender", "Unknown")
    bmi = patient_data.get("bmi", 24.0)
    diabetes = patient_data.get("diabetes", "No")
    hypertension = patient_data.get("hypertension", "No")
    smoking = patient_data.get("smoking_status", "Never")
    risk_level = patient_data.get("risk_level", "Low")
    ehr_notes = patient_data.get("notes", "No active summaries.")
    clinical_summary = patient_data.get("clinical_summary", "No recent clinical notes.")
    
    systolic_bp = patient_data.get("systolic_bp_mean", 120.0)
    diastolic_bp = patient_data.get("diastolic_bp_mean", 80.0)
    heart_rate = patient_data.get("heart_rate_mean", 72.0)
    spo2 = patient_data.get("spo2_mean", 98.0)
    
    # 2. Try LLM first
    system_prompt = (
        "You are Clinivision AI, an intelligent preventive healthcare assistant.\n"
        "Here is the clinical profile of the patient you are talking to:\n"
        f"- Patient ID: {patient_id}\n"
        f"- Age: {age}, Gender: {gender}, BMI: {bmi}\n"
        f"- History: Diabetes={diabetes}, Hypertension={hypertension}, Smoking Status={smoking}\n"
        f"- Current Vitals: Heart Rate={heart_rate:.1f} bpm, Blood Pressure={systolic_bp:.1f}/{diastolic_bp:.1f} mmHg, SpO2={spo2:.1f}%\n"
        f"- Predicted Disease Risk Level: {risk_level}\n"
        f"- EHR Notes: {ehr_notes}\n"
        f"- Doctor's Summary: {clinical_summary}\n\n"
        "Guidelines:\n"
        "1. Provide empathetic, scientifically accurate, and encouraging health recommendations (diet, hydration, sleep, exercise).\n"
        "2. Address the user's questions specifically using their vitals and medical background.\n"
        "3. Always add a short disclaimer that you are an AI assistant helping with preventive care, not a doctor making medical diagnoses.\n"
        "4. Keep response under 150 words."
    )
    
    prompt = f"User says: {user_message}\n\nChat History (Last few turns): {chat_history or []}"
    
    llm_reply = query_llm(prompt, system_prompt)
    if llm_reply:
        return llm_reply
        
    # 3. Fallback: Expert clinical rule-based engine
    msg = user_message.lower()
    reply = ""
    
    # Check key areas of interest
    if "risk" in msg or "why" in msg or "score" in msg or "level" in msg:
        reply = (
            f"Based on our machine learning assessment, your chronic disease risk level is **{risk_level}**. "
        )
        factors = []
        if risk_level == "High":
            factors.append("elevated blood pressure readings")
            if smoking in ["Current", "Former"]:
                factors.append("smoking history")
            if diabetes == "Yes":
                factors.append("pre-existing diabetes")
            if hypertension == "Yes":
                factors.append("pre-existing hypertension")
            if bmi >= 25.0:
                factors.append(f"overweight BMI of {bmi}")
            reply += "This high classification is primarily influenced by: " + ", ".join(factors) + ". "
            reply += "We strongly suggest regular cardiovascular monitoring and discussing these parameters with your doctor."
        elif risk_level == "Medium":
            if bmi >= 25.0:
                factors.append(f"a BMI of {bmi}")
            if systolic_bp > 130 or diastolic_bp > 85:
                factors.append("slightly elevated blood pressure")
            if factors:
                reply += "Contributing factors include: " + ", ".join(factors) + ". "
            reply += "Small shifts in nutrition, sodium restriction, and mild exercise can help lower your risk back to Low."
        else:
            reply += "Your metrics look very stable! Your risk is classified as **Low**. Keep maintaining your healthy lifestyle!"
            
    elif "diet" in msg or "food" in msg or "eat" in msg:
        reply = "Here are personalized nutrition suggestions based on your clinical profile:\n"
        if diabetes == "Yes":
            reply += "- **Glycemic Control**: Prioritize whole grains, leafy greens, and lean proteins. Avoid processed sugars and simple carbs.\n"
        if hypertension == "Yes" or systolic_bp > 130:
            reply += "- **Sodium Restriction**: Limit daily sodium to under 1,500mg. Follow a DASH-style diet (rich in potassium, calcium, and magnesium).\n"
        if bmi >= 25.0:
            reply += "- **Caloric Balance**: Focus on high-fiber foods to increase satiety and control portions.\n"
        if not reply.endswith(":\n"):
            reply += "- **Heart-Healthy Foods**: Include olive oil, fatty fish (omega-3s), nuts, and seeds.\n- **Hydration**: Drink 2-2.5 liters of water daily to support metabolic function.\n"
        else:
            reply += "- **Hydration**: Maintain steady water intake to aid digestion and blood circulation."
            
    elif "exercise" in msg or "workout" in msg or "sport" in msg or "activity" in msg:
        reply = "Based on your clinical profile, here is a recommended exercise regimen:\n"
        if risk_level == "High":
            reply += "- **Light Aerobic Activity**: Propose 20-30 minutes of brisk walking or swimming 3-4 times a week. Avoid heavy weightlifting without consulting your physician first.\n"
        else:
            reply += "- **Moderate Cardio**: Aim for 150 minutes of moderate activity (jogging, cycling) weekly.\n- **Strength Training**: Integrate light resistance training twice a week.\n"
        reply += f"- **Vitals Guideline**: Keep your heart rate under control. Your current resting heart rate averages **{heart_rate:.1f} bpm**."
        
    elif "vitals" in msg or "blood pressure" in msg or "bp" in msg or "heart rate" in msg:
        reply = (
            f"Your clinical records show:\n"
            f"- **Blood Pressure**: Averages **{systolic_bp:.1f}/{diastolic_bp:.1f} mmHg** (Normal is <120/80).\n"
            f"- **Heart Rate**: Averages **{heart_rate:.1f} bpm**.\n"
            f"- **Oxygen Level (SpO2)**: Averages **{spo2:.1f}%**.\n"
        )
        if systolic_bp >= 130 or diastolic_bp >= 80:
            reply += "Your blood pressure is in the elevated range. Consider tracking this daily and limiting salt."
        else:
            reply += "Your vitals appear well within normal physiological ranges."
            
    elif "hello" in msg or "hi" in msg or "hey" in msg:
        reply = f"Hello! I am Clinivision AI. How can I help you today, patient {patient_id}? I can explain your health risk levels, recommend diet/exercise guidelines, or break down your current vitals."
        
    else:
        reply = (
            f"I hear you. Looking at your health parameters (Age: {age}, BMI: {bmi}, Risk: {risk_level}), "
            "it is always best to focus on key areas of wellness: staying hydrated, sleeping 7-8 hours, "
            "consuming whole foods, and keeping active. Let me know if you would like me to detail a specific diet or exercise plan!"
        )
        
    # Append clinical disclaimer
    reply += "\n\n*Disclaimer: I am an AI health helper. These recommendations are for preventive wellness guidance and do not replace professional medical advice.*"
    return reply
