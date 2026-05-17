import argparse
import csv
from datetime import datetime
from collections import defaultdict

CSV_FILE = "scl_electric_usage_interval_data_9260149761_1_2025-05-14_to_2026-05-14.csv"

# Rates
BASE_PER_DAY = 0.3945
FLAT_RATE = 0.1338
PEAK_RATE = 0.1610
MID_PEAK_RATE = 0.1409
OFF_PEAK_RATE = 0.0805


def classify_tou(weekday, hour):
    """Return (rate_name, rate) for given weekday (0=Mon..6=Sun) and hour (0-23)."""
    if hour < 6:  # midnight to 6am, every day
        return "Off-Peak", OFF_PEAK_RATE
    if weekday == 6:  # Sunday: mid-peak 6am to midnight
        return "Mid-Peak", MID_PEAK_RATE
    # Monday-Saturday
    if 17 <= hour < 21:  # 5pm to 9pm
        return "Peak", PEAK_RATE
    return "Mid-Peak", MID_PEAK_RATE  # 6am-5pm and 9pm-midnight


def main():
    parser = argparse.ArgumentParser(
        description='Compute TOU vs flat rate for SCL usage')
    parser.add_argument('filename', metavar='str', type=str, help='input CSV')
    args = parser.parse_args()
    CSV_FILE = args.filename

    daily_costs = defaultdict(lambda: {"flat": 0.0, "tou": 0.0})
    tou_bucket_costs = {"Peak": 0.0, "Mid-Peak": 0.0, "Off-Peak": 0.0}
    hourly_usage = defaultdict(float)  # hour -> kWh

    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        # BOM counts as line 1; skip 6 lines so DictReader reads the header
        for _ in range(6):
            next(f)
        reader = csv.DictReader(f)
        for row in reader:
            kwh = float(row["IMPORT (kWh)"])
            date_str = row["DATE"]
            start_str = row["START TIME"]

            dt = datetime.strptime(f"{date_str} {start_str}", "%Y-%m-%d %H:%M")
            weekday = dt.weekday()  # 0=Monday, 6=Sunday
            hour = dt.hour

            flat_cost = kwh * FLAT_RATE
            rate_name, tou_rate = classify_tou(weekday, hour)
            tou_cost = kwh * tou_rate

            date_key = date_str
            daily_costs[date_key]["flat"] += flat_cost
            daily_costs[date_key]["tou"] += tou_cost

            tou_bucket_costs[rate_name] += tou_cost
            hourly_usage[hour] += kwh

    unique_days = len(daily_costs)
    base_total = unique_days * BASE_PER_DAY

    total_flat = base_total + sum(d["flat"] for d in daily_costs.values())
    total_tou = base_total + sum(d["tou"] for d in daily_costs.values())

    print(f"=== Total Cost Comparison ({unique_days} days) ===")
    print(f"  Flat rate:       ${total_flat:.2f}")
    print(f"  Time-of-use:     ${total_tou:.2f}")
    print(f"  Difference:      ${total_tou - total_flat:.2f} ({'TOU costs more' if total_tou > total_flat else 'TOU saves money'})")

    print(f"\n=== TOU Cost Breakdown (energy charges only) ===")
    for bucket in ["Peak", "Mid-Peak", "Off-Peak"]:
        print(f"  {bucket:12s}: ${tou_bucket_costs[bucket]:.2f}")

    print(f"\n=== Hourly Usage Histogram (kWh) ===")
    for hour in range(24):
        label = f"{hour:02d}:00-{hour+1:02d}:00"
        kwh = hourly_usage[hour]
        bar = "#" * int(kwh / 10)
        print(f"  {label}  {kwh:8.2f} kWh  {bar}")


if __name__ == "__main__":
    main()
