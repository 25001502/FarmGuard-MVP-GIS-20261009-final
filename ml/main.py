import numpy as np
import pandas as pd
import lightgbm as lgb

# 1. Load Data
csv_path = r"C:\Users\khomo\Videos\2nd Semester 2026\Hackathon\Calf_Heartrate_Dataset.csv"
df = pd.read_csv(csv_path)
print(f"Dataset successfully loaded with {len(df):,} total rows!\n")

print("Column Names & Data Types:")
print(df.dtypes)
print("\nFirst 5 Rows:")
print(df.head())

# 2. Calculate Vector Magnitude
print("\nCalculating vector magnitude...")
df["magnitude"] = np.sqrt(df["accX"] ** 2 + df["accY"] ** 2 + df["accZ"] ** 2)

# 3. Create 3-Second Window IDs
window_size = 75  # 3 seconds * 25 Hz = 75 rows
df["window_id"] = df.groupby(["calfId", "segId"]).cumcount() // window_size

# Filter out incomplete trailing windows (less than 75 rows)
group_sizes = df.groupby(["calfId", "segId", "window_id"])["accX"].transform("count")
df_valid = df[group_sizes == window_size].copy()

# 4. Fast Vectorized Feature Extraction
print("\nProcessing feature samples...")

def get_mode(series):
    return series.mode()[0] if not series.empty else np.nan

features_df = df_valid.groupby(["calfId", "segId", "window_id"], as_index=False).agg(
    accX_mean=("accX", "mean"),
    accX_std=("accX", "std"),
    accY_mean=("accY", "mean"),
    accY_std=("accY", "std"),
    accZ_mean=("accZ", "mean"),
    accZ_std=("accZ", "std"),
    mag_mean=("magnitude", "mean"),
    mag_std=("magnitude", "std"),
    mag_max=("magnitude", "max"),
    behaviour=("behaviour", get_mode)
)

print(f"Extraction complete! Created {len(features_df):,} total 3-second feature samples.")
print(f"Dataset successfully compiled features for {features_df['calfId'].nunique()} unique calves.")

# Save Output
output_path = r"C:\Users\khomo\Videos\2nd Semester 2026\Hackathon\Calf_Features_3sec.csv"
features_df.to_csv(output_path, index=False)
print(f"\nClean feature matrix saved successfully to:\n{output_path}")

# 5. Handle Missing Values
print("\n--- FILLING MISSING STD VALUES ---")
features_df = features_df.copy()
std_cols = [col for col in features_df.columns if "std" in col]
features_df[std_cols] = features_df[std_cols].fillna(0)
print(f"Checked {len(std_cols)} standard deviation columns for missing values.")

# 6. Target Encoding (Pure Pandas)
print("\n--- TARGET ENCODING ---")
features_df = features_df.dropna(subset=["behaviour"]).reset_index(drop=True)
features_df["target"], unique_labels = pd.factorize(features_df["behaviour"])

print("\nTarget Class Breakdown:")
print(features_df["behaviour"].value_counts())

print("\nClass Mapping (Text Label -> Numeric ID):")
mapping_df = pd.DataFrame({
    "Class_ID": range(len(unique_labels)),
    "Behaviour": unique_labels
})
print(mapping_df.to_string(index=False))

# 7. Feature & Identifier Separation
print("\n--- SEPARATING FEATURES AND IDENTIFIERS ---")
id_cols = ["calfId", "segId", "window_id", "behaviour", "target"]
feature_cols = [col for col in features_df.columns if col not in id_cols]

X = features_df[feature_cols]
y = features_df["target"]
groups = features_df["calfId"]

print(f"Features ready for model training ({X.shape[1]} columns):")
print(feature_cols)

# 8. Native LightGBM Training (No Scikit-Learn Dependencies)
print("\n--- MODEL TRAINING (NATIVE LIGHTGBM API) ---")

# Group-based split by calfId to avoid data leakage
unique_calves = groups.unique()
np.random.seed(42)
np.random.shuffle(unique_calves)

num_test_calves = max(1, int(len(unique_calves) * 0.2))
test_calves = unique_calves[:num_test_calves]
train_calves = unique_calves[num_test_calves:]

print(f"Training on {len(train_calves)} calves, Testing on {len(test_calves)} calves.")

train_mask = groups.isin(train_calves)
test_mask = groups.isin(test_calves)

X_train, y_train = X[train_mask], y[train_mask]
X_test, y_test = X[test_mask], y[test_mask]

# Create Native LightGBM Datasets
train_data = lgb.Dataset(X_train, label=y_train)
test_data = lgb.Dataset(X_test, label=y_test, reference=train_data)

# Set model parameters
num_classes = len(unique_labels)
params = {
    'objective': 'multiclass',
    'num_class': num_classes,
    'metric': 'multi_logloss',
    'learning_rate': 0.05,
    'seed': 42,
    'verbose': -1
}

print("\nTraining Native LightGBM model...")
bst = lgb.train(
    params,
    train_data,
    num_boost_round=100
)

# 9. Evaluation
print("\n--- MODEL EVALUATION ---")
# bst.predict returns probabilities for each class
raw_preds = bst.predict(X_test)
y_pred = np.argmax(raw_preds, axis=1)

accuracy = (y_pred == y_test.values).mean() * 100

print(f"Model Training Complete!")
print(f"Test Accuracy on unseen calves: {accuracy:.2f}%")

# Feature Importance
importances = bst.feature_importance(importance_type='split')
importance_df = pd.DataFrame({
    "Feature": feature_cols,
    "Importance": importances
}).sort_values(by="Importance", ascending=False)

print("\nTop Most Important Features:")
print(importance_df.head(5).to_string(index=False))