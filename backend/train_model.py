import os
import pickle
import json
import warnings
import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.preprocessing import LabelEncoder, StandardScaler, OrdinalEncoder
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier, GradientBoostingClassifier,
    HistGradientBoostingClassifier, VotingClassifier
)
from sklearn.metrics import classification_report, accuracy_score, f1_score, confusion_matrix
from sklearn.utils import resample
warnings.filterwarnings("ignore")

MASTER_PATH  = "d:/database/datasets/master_dataset.csv"
MODEL_PATH   = "d:/database/models/best_model.pkl"
METRICS_PATH = "d:/database/models/model_metrics.json"

CATEGORICAL = ["gender", "smoking_status", "diabetes", "hypertension"]
NUMERICAL   = [
    "age", "bmi", "height_m", "weight_kg",
    "heart_rate_mean","heart_rate_std","heart_rate_min","heart_rate_max",
    "systolic_bp_mean","systolic_bp_std","systolic_bp_min","systolic_bp_max",
    "diastolic_bp_mean","diastolic_bp_std","diastolic_bp_min","diastolic_bp_max",
    "temperature_mean","temperature_std","temperature_min","temperature_max",
    "spo2_mean","spo2_std","spo2_min","spo2_max",
]
FEATURES = CATEGORICAL + NUMERICAL
TARGET   = "risk_level"
RISK_ORDER = {"Low": 0, "Medium": 1, "High": 2}
RISK_INV   = {0: "Low", 1: "Medium", 2: "High"}


def make_preprocessor():
    """OrdinalEncode categoricals, StandardScale numericals."""
    return ColumnTransformer([
        ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), CATEGORICAL),
        ("num", StandardScaler(), NUMERICAL),
    ])


def build_pipeline(clf):
    return Pipeline([("pre", make_preprocessor()), ("clf", clf)])


def oversample(X, y):
    """Upsample minority classes to match majority count."""
    df = X.copy(); df["__y__"] = y.values
    max_n = df["__y__"].value_counts().max()
    parts = []
    for cls in df["__y__"].unique():
        sub = df[df["__y__"] == cls]
        if len(sub) < max_n:
            sub = resample(sub, replace=True, n_samples=max_n, random_state=42)
        parts.append(sub)
    bal = pd.concat(parts).sample(frac=1, random_state=42)
    return bal.drop(columns=["__y__"]), bal["__y__"]


def train_model():
    print("=" * 60)
    print("  Clinivision AI — Enhanced ML Training")
    print("=" * 60)

    if not os.path.exists(MASTER_PATH):
        print(f"ERROR: {MASTER_PATH} not found. Run data_pipeline.py first.")
        return

    df = pd.read_csv(MASTER_PATH)
    print(f"\nDataset: {len(df)} patients")

    # Encode target
    df = df.copy()
    df[TARGET] = df[TARGET].map(RISK_ORDER)

    X_raw = df[FEATURES].copy()
    y_raw = df[TARGET].copy()

    print("\nOriginal class distribution:")
    for k, v in sorted(y_raw.value_counts().items()):
        print(f"  {RISK_INV[k]:8s}: {v} patients")

    # Oversample to balance
    X_bal, y_bal = oversample(X_raw, y_raw)
    print(f"\nAfter oversampling: {len(X_bal)} samples (balanced)")
    for k, v in sorted(y_bal.value_counts().items()):
        print(f"  {RISK_INV[k]:8s}: {v} samples")

    # Models
    models = {
        "LogisticRegression": build_pipeline(
            LogisticRegression(C=0.5, class_weight="balanced", max_iter=2000, random_state=42)
        ),
        "DecisionTree": build_pipeline(
            DecisionTreeClassifier(max_depth=4, class_weight="balanced", random_state=42)
        ),
        "RandomForest": build_pipeline(
            RandomForestClassifier(n_estimators=200, max_depth=5, class_weight="balanced", random_state=42)
        ),
        "GradientBoosting": build_pipeline(
            GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=42)
        ),
        "HistGradientBoosting": build_pipeline(
            HistGradientBoostingClassifier(max_iter=200, max_depth=4, learning_rate=0.05, random_state=42)
        ),
    }

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_results = {}
    best_name, best_f1 = None, -1

    print("\nComparing models (5-Fold CV on balanced data)...")
    for name, pipe in models.items():
        sc = cross_validate(pipe, X_bal, y_bal, cv=skf,
                            scoring=["accuracy", "f1_macro", "f1_weighted"], n_jobs=-1)
        acc = sc["test_accuracy"].mean()
        f1m = sc["test_f1_macro"].mean()
        f1w = sc["test_f1_weighted"].mean()
        cv_results[name] = {
            "accuracy": round(float(acc), 4),
            "f1_score": round(float(f1m), 4),
            "f1_weighted": round(float(f1w), 4),
        }
        print(f"  {name:25s}: Acc={acc:.3f}  Macro-F1={f1m:.3f}  Weighted-F1={f1w:.3f}")
        if f1m > best_f1:
            best_f1, best_name = f1m, name

    # Ensemble
    ens_estimators = [
        ("rf", RandomForestClassifier(n_estimators=200, max_depth=5, class_weight="balanced", random_state=42)),
        ("gb", GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=42)),
        ("lr", LogisticRegression(C=0.5, class_weight="balanced", max_iter=2000, random_state=42)),
    ]
    ensemble = build_pipeline(VotingClassifier(estimators=ens_estimators, voting="soft"))
    esc = cross_validate(ensemble, X_bal, y_bal, cv=skf,
                         scoring=["accuracy", "f1_macro", "f1_weighted"], n_jobs=-1)
    e_acc = esc["test_accuracy"].mean()
    e_f1m = esc["test_f1_macro"].mean()
    e_f1w = esc["test_f1_weighted"].mean()
    cv_results["Ensemble (RF+GB+LR)"] = {
        "accuracy": round(float(e_acc), 4),
        "f1_score": round(float(e_f1m), 4),
        "f1_weighted": round(float(e_f1w), 4),
    }
    print(f"  {'Ensemble (RF+GB+LR)':25s}: Acc={e_acc:.3f}  Macro-F1={e_f1m:.3f}  Weighted-F1={e_f1w:.3f}")
    if e_f1m > best_f1:
        best_f1, best_name = e_f1m, "Ensemble (RF+GB+LR)"
        best_pipeline = ensemble
    else:
        best_pipeline = models[best_name]

    print(f"\n==> Winner: {best_name}  (CV Macro-F1 = {best_f1:.3f})")

    # Final training on balanced data
    print(f"Training final model on {len(X_bal)} balanced samples...")
    best_pipeline.fit(X_bal, y_bal)

    # Evaluate on original 50 patients
    y_pred = best_pipeline.predict(X_raw)
    train_acc = accuracy_score(y_raw, y_pred)
    train_f1  = f1_score(y_raw, y_pred, average="macro", zero_division=0)
    report    = classification_report(y_raw, y_pred,
                    target_names=["High", "Low", "Medium"],
                    output_dict=True, zero_division=0)
    cm = confusion_matrix(y_raw, y_pred).tolist()

    print(f"\nTrain Accuracy (50 patients): {train_acc:.3f}")
    print(f"Train Macro-F1             : {train_f1:.3f}")
    print(classification_report(y_raw, y_pred,
            target_names=["High", "Low", "Medium"], zero_division=0))

    # Feature importances
    feature_importances = []
    try:
        clf_step = best_pipeline.named_steps["clf"]
        if hasattr(clf_step, "feature_importances_"):
            imps = clf_step.feature_importances_
        elif hasattr(clf_step, "estimators_"):
            subs = [e.feature_importances_ for _, e in clf_step.estimators_
                    if hasattr(e, "feature_importances_")]
            imps = np.mean(subs, axis=0) if subs else np.zeros(len(FEATURES))
        elif hasattr(clf_step, "coef_"):
            imps = np.abs(clf_step.coef_).mean(axis=0)
        else:
            imps = np.zeros(len(FEATURES))
        feature_importances = sorted(
            [{"feature": f, "importance": round(float(v), 5)} for f, v in zip(FEATURES, imps)],
            key=lambda x: x["importance"], reverse=True
        )
    except Exception as e:
        print(f"  (Feature importance skipped: {e})")

    # Save
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(best_pipeline, f)

    metrics = {
        "model_name": best_name,
        "train_accuracy": round(float(train_acc), 4),
        "train_f1_macro": round(float(train_f1), 4),
        "cv_note": "CV on balanced oversampled data (90 samples). Lower CV vs train expected with 50 real patients.",
        "dataset_size": int(len(df)),
        "balanced_size": int(len(X_bal)),
        "cv_results": cv_results,
        "classification_report": report,
        "confusion_matrix": cm,
        "confusion_matrix_labels": ["High", "Low", "Medium"],
        "feature_importances": feature_importances,
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nModel  saved → {MODEL_PATH}")
    print(f"Metrics saved → {METRICS_PATH}")
    print("✅ Training complete!")
    return best_pipeline


if __name__ == "__main__":
    train_model()
