# Interpreting usage

There's a CSV file in this directory. Don't pull it into your context, although you may head a few lines at a time.

There are 6 lines of account metadata; skip those. CSV header and data start on line 7.
* Ignore the "NOTES" column.
* Assume that "START TIME" and "END TIME" are in Pacific (local) time.
* "IMPORT (kWh)" is the column that represents electrical usage.

# Estimating cost

I gathered up-to-date billing rates on May 17, 2026.

We want to compare two cost schemes: flat rate and time-of-use (TOU).

## Flat rate

Rates page: https://seattle.gov/city-light/residential-services/billing-information/rates
* Base cost per day: $0.3945
* Energy cost per kWh: $0.1338

## Time of use

Time-of-use (TOU) rates page: https://powerlines.seattle.gov/2026/05/04/introducing-our-new-time-of-use-rate/
* Base cost per day: $0.3945
* "Peak" rate (5pm to 9pm, Monday through Saturday): $0.1610 per kWh
* "Mid-peak" rate (6am to 5pm, Monday through Saturday, and 9pm to midnight, Monday through Saturday, and 6am to midnight on Sundays): $0.1409 per kWh
* "Off-peak" rate (midnight to 6pm, every day): $0.0805

# Analyzing usage

Write a Python program that computes the total cost (over all data points) under both flat-rate and time-of-use. We would like to compare the pricing plans to save money.

Load the CSV data. For each row of data, use the `datetime` library to calculate the day of the week (e.g., Sunday) from the "DATE" column. Then:
- Determine from the plan descriptions above whether the period is Peak, Mid-Peak, or Off-Peak.
- Compute the flat-rate and TOU costs for the usage according to the time-of-use rates.
- Keep a running total of the per-day cost (under each pricing plan) for each day. We'll plot these later.
- For TOU, keep a running total of the kWh cost per rate type. For example, if the current row refers to a Saturday at 2pm, add the cost to the "Mid-Peak" cost bucket.
- Keep a running total of usage (not cost) per hour of the day. For example, if the current row refers to a Sunday at 3pm, count its usage in kWh in a "3pm to 4pm" bucket.

At the end, emit:
- a total cost for each pricing plan (flat rate or TOU)
- for TOU, a breakdown of the cost per rate type (Peak, Mid-Peak, Off-Peak).
- a histogram of daily usage per hour.
