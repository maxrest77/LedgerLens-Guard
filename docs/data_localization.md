# Data Localization Compliance Status

## RBI Payment Data Storage Requirement
The Reserve Bank of India (RBI) mandates under the "Storage of Payment System Data" directive that all data relating to payment systems operated in India must be stored in a system located only in India. This includes full end-to-end transaction details, customer data, refund payloads, and systemic reconciliation logs.

## Current Enforcement Mechanism
To guarantee infrastructure compliance and prevent accidental cross-region deployments, the LedgerLens Guard backend actively enforces this requirement at boot via `backend/api/compliance.py`. 

The application requires the `HOSTING_REGION` environment variable to be explicitly set to a recognized India-based cloud region (e.g., `ap-south-1`, `asia-south1`, `centralindia`). 

If this variable is missing or points to a non-compliant region (e.g., `us-east-1`), the application refuses to start (Hard-Fail). A hard-fail is implemented because silently capturing payment payloads into a non-compliant region even for a few minutes constitutes a severe regulatory breach.

## Action Required: Human Confirmation
While the application natively enforces the environment variable constraint, **an infrastructure administrator must still manually confirm that the underlying cloud infrastructure (Database volumes, S3 Backup Buckets, and CloudWatch/Datadog logging clusters) are actually physically deployed in the designated India region.** 

A code agent cannot verify the physical location of the cloud resources matching the environment configuration.
