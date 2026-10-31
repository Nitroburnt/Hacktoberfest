
import csv
from datetime import datetime
import warnings

def parse_transactions(csv_path):
    result=[]
    seen=set()
    with open(csv_path) as f:
        reader=csv.DictReader(f)
        for idx, row in enumerate(reader, start=2):
            try:
                tid=row.get('transaction_id','').strip()
                if not tid:
                    warnings.warn(f"Row {idx} missing id, skipped")
                    continue
                if tid in seen:
                    continue
                date_str=row.get('date','').strip()
                datetime.strptime(date_str, '%Y-%m-%d')  # ISO validation
                # additional: amount must be numeric
                float(row.get('amount','0'))
                seen.add(tid)
                result.append({k:v.strip() if isinstance(v,str) else v for k,v in row.items()})
            except Exception as e:
                warnings.warn(f"Row {idx} malformed: {e}")
                continue
    return result
