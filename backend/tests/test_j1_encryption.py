import pytest
from backend.utils.crypto import encrypt_pii, decrypt_pii
from backend.data.schema import Payment

def test_j1_pii_encryption():
    raw_ip = "192.168.1.1"
    raw_cust = "cust_12345"
    
    enc_ip = encrypt_pii(raw_ip)
    enc_cust = encrypt_pii(raw_cust)
    
    assert enc_ip != raw_ip
    assert enc_cust != raw_cust
    
    # Should not be identical even for same input due to salt/iv
    enc_ip2 = encrypt_pii(raw_ip)
    assert enc_ip != enc_ip2
    
    assert decrypt_pii(enc_ip) == raw_ip
    assert decrypt_pii(enc_cust) == raw_cust
    
    # Check fallback for unencrypted
    assert decrypt_pii("unencrypted") == "unencrypted"
