
import csv
def parse_transactions(csv_path):
    result=[]
    with open(csv_path) as f:
        reader=csv.DictReader(f)
        for row in reader:
            # BUG: no date validation, no dedup, crashes on malformed
            result.append(row)
    return result
