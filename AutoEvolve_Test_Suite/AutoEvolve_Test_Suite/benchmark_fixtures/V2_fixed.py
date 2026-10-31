
import csv
from datetime import datetime

def parse_transactions(csv_path):
    result=[]
    seen=set()
    with open(csv_path) as f:
        reader=csv.DictReader(f)
        for row in reader:
            try:
                tid=row.get('transaction_id')
                if not tid or tid in seen:
                    continue
                # date validation
                datetime.strptime(row['date'], '%Y-%m-%d')
                seen.add(tid)
                result.append(row)
            except:
                continue
    return result
