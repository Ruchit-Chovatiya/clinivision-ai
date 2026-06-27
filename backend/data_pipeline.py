import os
import json
import numpy as np
import pandas as pd

def run_pipeline(base_dir="d:/database"):
    print("Starting Clinivision AI Data Pipeline...")
    
    # 1. Load datasets
    demographics_path = os.path.join(base_dir, "demographics.csv")
    labels_path = os.path.join(base_dir, "disease_risk_labels.csv")
    vitals_path = os.path.join(base_dir, "vitals_time_series.csv")
    ehr_path = os.path.join(base_dir, "ehr_records.json")
    
    print("Loading datasets...")
    df_demo = pd.read_csv(demographics_path)
    df_labels = pd.read_csv(labels_path)
    df_vitals = pd.read_csv(vitals_path)
    
    with open(ehr_path, 'r') as f:
        ehr_data = json.load(f)
    df_ehr = pd.DataFrame(ehr_data)
    
    print(f"Demographics loaded: {df_demo.shape[0]} rows")
    print(f"Labels loaded: {df_labels.shape[0]} rows")
    print(f"Vitals loaded: {df_vitals.shape[0]} rows")
    print(f"EHR Records loaded: {df_ehr.shape[0]} rows")
    
    # 2. Aggregate Vitals Time Series (24 hourly readings per patient)
    print("Aggregating vitals time-series data...")
    vital_cols = ["heart_rate", "systolic_bp", "diastolic_bp", "temperature", "spo2"]
    
    # We want mean, min, max, and std for each vital metric
    agg_funcs = {col: ["mean", "min", "max", "std"] for col in vital_cols}
    df_vitals_agg = df_vitals.groupby("patient_id").agg(agg_funcs)
    
    # Flatten column multi-index: e.g., 'heart_rate_mean', 'heart_rate_min'
    df_vitals_agg.columns = [f"{col}_{stat}" for col, stat in df_vitals_agg.columns]
    df_vitals_agg = df_vitals_agg.reset_index()
    print(f"Aggregated vitals shape: {df_vitals_agg.shape}")
    
    # 3. Merge Datasets
    print("Merging datasets on patient_id...")
    master_df = df_demo.merge(df_labels, on="patient_id", how="inner")
    master_df = master_df.merge(df_vitals_agg, on="patient_id", how="inner")
    master_df = master_df.merge(df_ehr, on="patient_id", how="inner")
    
    # 4. Feature Engineering: Synthetic BMI
    print("Engineering synthetic BMI, height, and weight features...")
    # Set seed for reproducibility
    np.random.seed(42)
    
    heights = []
    weights = []
    bmis = []
    
    for idx, row in master_df.iterrows():
        is_male = row["gender"].strip().lower() == "male"
        has_diabetes = row["diabetes"].strip().lower() == "yes"
        has_hyper = row["hypertension"].strip().lower() == "yes"
        age = row["age"]
        
        # Determine base height and weight
        if is_male:
            height = np.random.normal(1.76, 0.06)
            weight = np.random.normal(82, 10)
        else:
            height = np.random.normal(1.63, 0.05)
            weight = np.random.normal(68, 8)
            
        # Correlate weight with age, diabetes, and hypertension
        age_factor = (age - 40) * 0.15 if age > 40 else 0
        disease_factor = (10 if has_diabetes else 0) + (8 if has_hyper else 0)
        weight += age_factor + disease_factor + np.random.normal(0, 3)
        
        # Calculate BMI
        bmi = weight / (height ** 2)
        
        # Bound to realistic ranges
        bmi = np.clip(bmi, 18.0, 42.0)
        # Recalculate weight from clipped BMI to ensure math consistency
        weight = bmi * (height ** 2)
        
        heights.append(round(height, 2))
        weights.append(round(weight, 1))
        bmis.append(round(bmi, 1))
        
    master_df["height_m"] = heights
    master_df["weight_kg"] = weights
    master_df["bmi"] = bmis
    
    # Save the output
    out_dir = os.path.join(base_dir, "datasets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "master_dataset.csv")
    
    master_df.to_csv(out_path, index=False)
    print(f"Master dataset successfully created and saved to {out_path}")
    print(f"Final shape: {master_df.shape}")
    print("Sample Columns:")
    print(master_df[["patient_id", "age", "gender", "bmi", "risk_level"]].head())

if __name__ == "__main__":
    run_pipeline()
