import os
import glob

def patch_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# Add RequireRole to imports
for f in glob.glob("backend/api/routes/*.py"):
    if "webhooks.py" in f:
        continue
    patch_file(f, [
        ("from backend.api.auth import get_current_reviewer, get_db", "from backend.api.auth import get_current_reviewer, get_db, RequireRole"),
        ("from backend.api.auth import get_db, verify_password, create_access_token, get_current_reviewer", "from backend.api.auth import get_db, verify_password, create_access_token, get_current_reviewer, RequireRole")
    ])

# Read roles (all roles allowed)
READ_ROLES = 'RequireRole(["REVIEWER", "SENIOR_APPROVER", "AUDITOR", "ADMIN"])'
# Write roles (no auditor)
WRITE_ROLES = 'RequireRole(["REVIEWER", "SENIOR_APPROVER", "ADMIN"])'

# audit.py
patch_file("backend/api/routes/audit.py", [
    ("current_reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({READ_ROLES})")
])

# dashboard.py
patch_file("backend/api/routes/dashboard.py", [
    ("current_reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({READ_ROLES})")
])

# exceptions.py
patch_file("backend/api/routes/exceptions.py", [
    ("current_reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({READ_ROLES})")
])

# export.py
patch_file("backend/api/routes/export.py", [
    ("current_reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({READ_ROLES})")
])

# reconciliation.py
patch_file("backend/api/routes/reconciliation.py", [
    ("current_reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({READ_ROLES})")
])

# reviewer.py
patch_file("backend/api/routes/reviewer.py", [
    ("current_reviewer: Reviewer = Depends(get_current_reviewer)", f"current_reviewer = Depends({WRITE_ROLES})")
])

print("Patched all routes successfully.")
