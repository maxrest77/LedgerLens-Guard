import os
from cryptography.fernet import Fernet

_KEY = os.getenv("ENCRYPTION_KEY")
if not _KEY:
    # Generate a random key for development if not provided
    _KEY = Fernet.generate_key().decode('utf-8')
    os.environ["ENCRYPTION_KEY"] = _KEY

_fernet = Fernet(_KEY.encode('utf-8'))

def encrypt_pii(data: str) -> str:
    if not data:
        return data
    return _fernet.encrypt(data.encode('utf-8')).decode('utf-8')

def decrypt_pii(data: str) -> str:
    if not data:
        return data
    try:
        return _fernet.decrypt(data.encode('utf-8')).decode('utf-8')
    except Exception:
        # Fallback if the data wasn't encrypted (e.g. legacy data)
        return data
