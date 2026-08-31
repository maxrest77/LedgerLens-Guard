import os
from sqlmodel import Session
from passlib.context import CryptContext
from backend.db.init import engine, init_db
from backend.data.generator import generate_dataset
from backend.data.schema import Reviewer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_db():
    # First ensure schema is created
    init_db()
    
    with Session(engine) as session:
        # Check if already seeded
        from sqlmodel import select
        existing = session.exec(select(Reviewer)).first()
        if existing:
            print("Database already seeded. Skipping.")
            return

        print("Seeding database with synthetic 400-record batch...")
        payments, refunds, settlements, links, bank_entries, adjustments = generate_dataset()
        
        session.add_all(payments)
        session.add_all(refunds)
        session.add_all(settlements)
        session.add_all(links)
        session.add_all(bank_entries)
        session.add_all(adjustments)
        
        print("Seeding reviewer accounts...")
        reviewer1_email = os.getenv("REVIEWER_1_EMAIL", "reviewer@ledgerlens.dev")
        reviewer1_pass = os.getenv("REVIEWER_1_PASSWORD", "demo_reviewer_2024")
        reviewer2_email = os.getenv("REVIEWER_2_EMAIL", "admin@ledgerlens.dev")
        reviewer2_pass = os.getenv("REVIEWER_2_PASSWORD", "demo_admin_2024")
        
        session.add(Reviewer(
            email=reviewer1_email,
            hashed_password=pwd_context.hash(reviewer1_pass)
        ))
        session.add(Reviewer(
            email=reviewer2_email,
            hashed_password=pwd_context.hash(reviewer2_pass),
            role="ADMIN"
        ))
        
        session.commit()
        print("Database seeded successfully.")

if __name__ == "__main__":
    seed_db()
