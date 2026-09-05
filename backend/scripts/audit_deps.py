import os
import sys
import ast
import tomllib

with open("backend/pyproject.toml", "rb") as f:
    data = tomllib.load(f)

declared = [
    d.split("<")[0].split(">")[0].split("=")[0].split("[")[0].strip().replace("-", "_").lower()
    for d in data.get("project", {}).get("dependencies", [])
]
print("Declared in pyproject.toml:", sorted(declared))

imported = set()
for root, _, files in os.walk("backend"):
    if ".venv" in root:
        continue
    for file in files:
        if file.endswith(".py"):
            try:
                tree = ast.parse(open(os.path.join(root, file), encoding="utf-8", errors="ignore").read())
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for n in node.names:
                            imported.add(n.name.split(".")[0])
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        imported.add(node.module.split(".")[0])
            except Exception:
                pass

stdlib = sys.stdlib_module_names
third_party = sorted([m for m in imported if m not in stdlib and m != "backend"])
print(f"\nThird-party modules imported in code ({len(third_party)}):", third_party)

pkg_map = {
    "jose": "python_jose",
    "multipart": "python_multipart",
    "reportlab": "reportlab",
    "openpyxl": "openpyxl",
    "pypdf": "pypdf",
    "fastapi": "fastapi",
    "sqlmodel": "sqlmodel",
    "sqlalchemy": "sqlmodel",  # transitive via sqlmodel
    "pydantic": "sqlmodel",    # transitive via sqlmodel/fastapi
    "psycopg2": "psycopg2_binary",
    "cryptography": "cryptography",
    "passlib": "passlib",
    "pytest": "pytest",
    "httpx": "httpx",
    "uvicorn": "uvicorn",
    "opentimestamps": "opentimestamps_client",
    "starlette": "fastapi",    # transitive via fastapi
}

print("\n--- Mapping Check ---")
for m in third_party:
    norm = m.lower().replace("-", "_")
    matched = pkg_map.get(norm, norm)
    is_decl = matched in declared or norm in declared
    status = "[OK]" if is_decl else "[UNDECLARED]"
    print(f"  {status} {m:20} -> {matched}")
