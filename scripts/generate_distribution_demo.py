"""Reproducible synthetic marketing data for comparing imputation treatments."""
import csv
from pathlib import Path

destination = Path(__file__).resolve().parents[1] / "distribution-demo.csv"
with destination.open("w", newline="") as output:
    writer = csv.writer(output)
    writer.writerow(["campaign_id", "campaign_name", "channel", "launch_date", "spend_usd", "impressions", "clicks", "click_through_rate", "conversions", "revenue_usd"])
    for i in range(320):
        # Three ordinary-budget campaigns per enterprise campaign. The tail is
        # large enough to separate mean/median but still visible on ten bins.
        spend = 240 + (i * 37 % 420) if i % 4 != 3 else 2600 + (i * 61 % 2400)
        impressions = spend * (23 + i % 13)
        clicks = round(impressions * (0.012 + i % 9 * 0.002))
        rate = clicks / impressions
        missing = i % 16 in (0, 5, 10, 15)  # 25%, spread across budget groups
        channel = ["Paid Social", "Email", "Display", "Search"][i % 4]
        if i % 20 == 0:
            channel = "paid_social"
        name = "" if i % 53 == 0 else f"{'Enterprise' if i % 4 == 3 else 'Regional'} campaign {i + 1:03}"
        date = f"2025-{1 + i % 12:02}-{1 + i % 27:02}"
        if i % 29 == 0:
            date = f"{1 + i % 12:02}/{1 + i % 27:02}/2025"
        writer.writerow([f"DEMO-{i + 1:04}", name, channel, date, "" if missing else spend, impressions,
                         impressions + 50 if i % 71 == 0 else clicks,
                         round(rate * 100 if i % 31 == 0 else rate, 4),
                         round(clicks * .045), round(spend * (1.5 + i % 7 * .4), 2)])
print(f"Generated {destination.name}: 320 rows, 80 missing spend values.")
