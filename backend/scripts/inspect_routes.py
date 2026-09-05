from backend.api.main import app

schema = app.openapi()
paths = schema.get("paths", {})
print(f"Total OpenAPI Paths: {len(paths)}")
for path, methods in sorted(paths.items()):
    for method, details in sorted(methods.items()):
        op_id = details.get("operationId", "unnamed")
        summary = details.get("summary", "")
        tags = details.get("tags", [])
        print(f"{method.upper():6} {path:50} [{op_id}] tags={tags}")
