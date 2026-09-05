from backend.jobs.anchoring import verify_anchors

def verify_against_anchor(anchor_file_override=None):
    """
    Independently verifies the current database against the external WORM anchor in S3.
    This proves that history hasn't been rewritten, even if the main database was compromised.
    """
    # Note: anchor_file_override is kept for backwards-compatibility in tests if needed,
    # but the actual implementation now delegates to the S3-based verification job.
    return verify_anchors()

if __name__ == "__main__":
    verify_against_anchor()
