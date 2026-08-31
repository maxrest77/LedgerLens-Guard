import os
import time
import json
from sqlmodel import Session, select
from backend.db.init import engine
from backend.engine.reconciler import reconcile_batch
from backend.data.schema import CaseStatus, Payment, Settlement

# Resolve metrics file path relative to this file
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_METRICS_PATH = os.path.join(_BACKEND_DIR, "data", "last_batch_metrics.json")

def main():
    print("==================================================")
    print(" LedgerLens Guard - Batch Reconciliation Report")
    print("==================================================")
    print("Starting reconciliation batch...")
    start = time.time()
    
    with Session(engine) as session:
        # Count actual source records for honest reporting
        total_payments = len(session.exec(select(Payment)).all())
        total_settlements = len(session.exec(select(Settlement)).all())
        total_records = total_payments + total_settlements
        
        cases = reconcile_batch(session)
        
        duration = time.time() - start
        
        throughput = int(total_records / duration) if duration > 0 else 0
        
        auto_resolved = len([c for c in cases if c.status == CaseStatus.AUTO_RESOLVED])
        human_review = len([c for c in cases if c.status == CaseStatus.OPEN])
        exception_count = auto_resolved + human_review
        clean_count = total_records - exception_count
        match_rate = (clean_count / total_records * 100) if total_records > 0 else 100.0
        
        print(f"\n[Metrics]")
        print(f"Batch processed in : {duration * 1000:.0f}ms")
        print(f"Throughput         : {throughput} records/sec")
        print(f"Source Records     : {total_payments} payments + {total_settlements} settlements = {total_records}")
        print(f"Clean Matches      : {clean_count} ({match_rate:.1f}% match rate)")
        print(f"Exceptions Found   : {exception_count}")
        
        # Save metrics for dashboard
        with open(_METRICS_PATH, "w") as f:
            json.dump({
                "duration_ms": round(duration * 1000, 1),
                "throughput": throughput,
                "total_records": total_records,
                "match_rate": round(match_rate, 1),
                "auto_resolved": auto_resolved,
                "human_review": human_review
            }, f)
        
        print(f"\n[Resolution Strategy]")
        print(f"Auto-resolved      : {auto_resolved} (Below Rs.5 tolerance)")
        print(f"Requires Review    : {human_review} (Escalated to workspace)")
        
        print(f"\n[Exception Breakdown (Actionable)]")
        counts = {}
        for c in cases:
            if c.status == CaseStatus.OPEN:
                counts[c.exception_code] = counts.get(c.exception_code, 0) + 1
            
        for code, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
            print(f" - {code}: {count}")
            
        print("==================================================")

if __name__ == "__main__":
    main()
