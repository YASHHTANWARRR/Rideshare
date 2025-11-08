import csv
import os
import urllib.request
import zipfile

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

IN_TXT = os.path.join(DATA_DIR, "IN.txt")
ADMIN1 = os.path.join(DATA_DIR, "admin1CodesASCII.txt")
OUTPUT_CSV = "cities_only.csv"

def dl(url, dst):
    print("↓ downloading:", url)
    urllib.request.urlretrieve(url, dst)

# Download admin1CodesASCII.txt (state mapping)
if not os.path.exists(ADMIN1):
    dl("http://download.geonames.org/export/dump/admin1CodesASCII.txt", ADMIN1)

# Download IN.zip → extract IN.txt
if not os.path.exists(IN_TXT):
    zip_path = os.path.join(DATA_DIR, "IN.zip")
    dl("http://download.geonames.org/export/dump/IN.zip", zip_path)
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extract("IN.txt", DATA_DIR)
    os.remove(zip_path)


# ✅ MAJOR STATES
KEEP_STATES = {
    "Delhi","Punjab","Haryana","Uttar Pradesh","Rajasthan","Himachal Pradesh",
    "Uttarakhand","Jammu and Kashmir","Ladakh","Madhya Pradesh","Gujarat",
    "Maharashtra","West Bengal","Karnataka","Tamil Nadu","Telangana",
    "Andhra Pradesh","Kerala","Bihar","Chhattisgarh","Odisha"
}

# GeoNames "city-like" feature codes
KEEP_FEATURES = {"PPL","PPLA","PPLA2","PPLA3","PPLA4","PPLC"}

# Min population (0 = everything)
MIN_POP = 0



state_code_to_name = {}

with open(ADMIN1, "r", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split("\t")
        if len(parts) < 2:
            continue
        key = parts[0]        # IN.PB
        name = parts[1]       # Punjab
        scode = key.split(".")[-1]
        state_code_to_name[key] = (name, scode)



cities = set()

with open(IN_TXT, "r", encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 19:
            continue

        name = parts[1].strip()
        fclass = parts[6]
        fcode  = parts[7]
        cc     = parts[8]
        admin1 = parts[10]

        try:
            pop = int(parts[14]) if parts[14] else 0
        except:
            pop = 0

        if cc != "IN":
            continue
        if fclass != "P" or fcode not in KEEP_FEATURES:
            continue
        if pop < MIN_POP:
            continue

        key = f"IN.{admin1}"
        state_name, _ = state_code_to_name.get(key, (None, admin1))

        if not state_name:
            continue
        
        
        if KEEP_STATES and state_name not in KEEP_STATES:
            continue

        cities.add(name)



with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["city_name"])
    for city in sorted(cities):
        writer.writerow([city])

print(f"✅ Wrote {len(cities)} cities to {OUTPUT_CSV}")
