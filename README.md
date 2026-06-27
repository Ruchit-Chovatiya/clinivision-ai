# 🏥 Clinivision AI
### *Predict. Personalize. Prevent.*

> An AI-powered preventive healthcare platform that predicts chronic disease risk, provides explainable clinical insights, and delivers personalized health recommendations — in a real-time clinical dashboard.

---

## 📸 Dashboard Preview

| Dashboard | Risk Prediction | Recommendations |
|---|---|---|
| Vitals trend charts, risk gauge, patient profile | Explainable AI factors per patient | Personalized diet, exercise, medical advice |

---

## ✨ Features

- 🔍 **No login required** — direct access to all 50 patient records
- 📊 **Live Dashboard** — vitals cards, 24-hour charts, disease risk gauge
- 🤖 **AI Risk Prediction** — Gradient Boosting classifier with Explainable AI
- 💡 **Personalized Recommendations** — diet, exercise, lifestyle, medical guidance
- 🧪 **External Prediction** — enter any patient's data and get instant AI risk result
- 🩺 **AI Health Chatbot** — patient-aware clinical conversational assistant
- 🎯 **Daily Goals Tracker** — log and track water, sleep, exercise, weight
- 👥 **Doctor Dashboard** — searchable/filterable table of all 50 patients
- 📄 **EHR Records** — full electronic health record per patient
- 🔬 **ML Insights** — model metrics, algorithm comparison, live retrain button

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Recharts, Lucide React, Tailwind CSS v4 |
| **Backend** | Python, FastAPI, Uvicorn |
| **Database** | SQLite + SQLAlchemy ORM |
| **ML** | scikit-learn (Gradient Boosting + Ensemble), pandas, NumPy |
| **Styling** | Vanilla CSS (dark theme), Tailwind CSS v4 |

---

## 📁 Project Structure

```
clinivision-ai/
│
├── README.md                    ← You are here
├── requirements.txt             ← Python dependencies
├── .gitignore
│
├── demographics.csv             ← Raw patient demographics (50 patients)
├── vitals_time_series.csv       ← Raw vitals time-series (1,200 readings)
├── disease_risk_labels.csv      ← Risk labels per patient
├── ehr_records.json             ← Clinical notes / EHR data
├── data_dictionary.xlsx         ← Feature descriptions
│
├── datasets/                    ← Auto-generated (created by data_pipeline.py)
│   └── master_dataset.csv
│
├── models/                      ← Auto-generated (created by train_model.py)
│   ├── best_model.pkl
│   └── model_metrics.json
│
├── backend/                     ← FastAPI Python Server
│   ├── main.py                  ← Main API — all endpoints
│   ├── data_pipeline.py         ← Merges raw CSVs into master dataset
│   ├── train_model.py           ← Trains & saves ML model
│   └── app/
│       ├── models.py            ← SQLAlchemy DB models + Pydantic schemas
│       ├── chatbot.py           ← AI health chatbot logic
│       └── auth.py              ← Auth helpers
│
└── frontend/                    ← React + Vite Web App
    ├── package.json
    ├── vite.config.js
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx             ← React entry point
        ├── App.jsx              ← All 10 dashboard views
        └── index.css            ← Dark theme styles
```

---

## 🚀 Setup & Run Guide

### Prerequisites

Make sure you have these installed:

| Tool | Version | Download |
|---|---|---|
| **Python** | 3.9+ | https://www.python.org/downloads/ |
| **Node.js** | 18+ | https://nodejs.org/ |
| **npm** | 8+ | Included with Node.js |

> ⚠️ During Python installation, check **"Add Python to PATH"**

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Ruchit-Chovatiya/clinivision-ai.git
cd clinivision-ai
```

---

### Step 2 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

---

### Step 3 — Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

### Step 4 — Train the ML Model (First Time Only)

```bash
cd backend

# Process raw CSV files into master dataset
python data_pipeline.py

# Train and save the ML model
python train_model.py

cd ..
```

> This creates `datasets/master_dataset.csv` and `models/best_model.pkl` automatically.

---

### Step 5 — Run the Project

You need **two terminals** running simultaneously:

**Terminal 1 — Backend (FastAPI):**
```bash
cd backend
python main.py
```
✅ Wait for: `Application startup complete.`

**Terminal 2 — Frontend (React):**
```bash
cd frontend
npm run dev
```
✅ Wait for: `Local: http://localhost:5173/`

---

### Step 6 — Open in Browser

```
http://localhost:5173
```

---

## 🌐 Application URLs

| Service | URL | Description |
|---|---|---|
| 🌐 **Web Dashboard** | http://localhost:5173 | Main application |
| ⚙️ **API Server** | http://127.0.0.1:8000 | FastAPI backend |
| 📖 **API Docs** | http://127.0.0.1:8000/docs | Swagger UI (interactive) |

---

## 🤖 Machine Learning Details

### Dataset
- **50 patients** with multi-modal clinical data
- **1,200 time-series vitals** readings (24 per patient)
- **Target classes:** Low / Medium / High risk (60% / 30% / 10%)

### ML Pipeline
1. Merge raw CSVs → aggregate vitals (mean, std, min, max per patient)
2. Engineer BMI, height, weight features
3. **Oversample minority classes** to 30/30/30 balance
4. **OrdinalEncoder** for categoricals + **StandardScaler** for numericals
5. Compare 6 algorithms using **Stratified 5-Fold Cross-Validation**
6. Best model: **Gradient Boosting** (CV Macro-F1: ~90%)

### Model Performance (after balancing)

| Model | CV Accuracy | CV Macro-F1 |
|---|---|---|
| Logistic Regression | ~85% | ~84% |
| Decision Tree | ~82% | ~81% |
| Random Forest | ~82% | ~81% |
| **Gradient Boosting** ✅ | **~91%** | **~91%** |
| HistGradient Boosting | ~86% | ~85% |
| Ensemble (RF+GB+LR) | ~88% | ~87% |

---

## 🔌 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/patients` | List all 50 patients |
| `GET` | `/api/patients/{id}` | Single patient profile |
| `GET` | `/api/patients/{id}/predict` | AI risk prediction |
| `GET` | `/api/patients/{id}/logs` | Daily health logs |
| `POST` | `/api/patients/{id}/logs` | Save daily log entry |
| `GET` | `/api/patients/{id}/chat` | Chat history |
| `POST` | `/api/patients/{id}/chat` | Send AI chatbot message |
| `POST` | `/api/predict/external` | Predict for external patient data |
| `GET` | `/api/admin/metrics` | Model performance metrics |
| `POST` | `/api/admin/retrain` | Retrain model with new data |

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| `npm: not found` | Install Node.js from https://nodejs.org |
| `best_model.pkl not found` | Run Steps 4 (data_pipeline.py + train_model.py) first |
| Port 8000 in use | `netstat -ano \| findstr :8000` → `taskkill /PID <number> /F` |
| Port 5173 in use | `netstat -ano \| findstr :5173` → `taskkill /PID <number> /F` |
| Dashboard shows no data | Make sure backend is running (Terminal 1) |
| CORS error in browser | Confirm backend is at http://127.0.0.1:8000 |

---

## 👥 Team

Built for **DataPort Hackathon** — ChristMsAIM

---

## 📄 License

This project is built for academic/hackathon purposes.

---

*Clinivision AI — Predict. Personalize. Prevent.*
