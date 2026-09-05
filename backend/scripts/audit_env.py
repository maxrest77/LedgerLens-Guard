import os
import re

backend_files = [
    os.path.join(root, f)
    for root, _, files in os.walk("backend")
    for f in files
    if f.endswith(".py") and ".venv" not in root
]

env_calls = []
pattern = re.compile(r"os\.(?:getenv|environ\.get)\s*\(\s*[\"']([^\"']+)[\"']")

for path in backend_files:
    content = open(path, encoding="utf-8", errors="ignore").read()
    for match in pattern.finditer(content):
        env_calls.append((match.group(1), path))

unique_env_vars = sorted(list(set([var for var, _ in env_calls])))
print(f"Total unique env variables queried: {len(unique_env_vars)}")

env_example_lines = open(".env.example", encoding="utf-8").read().splitlines()
documented_vars = set()
for line in env_example_lines:
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        documented_vars.add(line.split("=")[0].strip())

print("\n--- Documented in .env.example ---")
for var in sorted(documented_vars):
    print(f"  [OK] {var}")

print("\n--- Env variables queried in code but NOT in .env.example ---")
missing_from_example = [v for v in unique_env_vars if v not in documented_vars]
for var in missing_from_example:
    callers = [os.path.relpath(p) for v, p in env_calls if v == var]
    print(f"  [MISSING] {var:30} in {callers}")
