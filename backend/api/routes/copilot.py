from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session
from backend.api.auth import get_current_reviewer, get_db
from backend.data.schema import Reviewer
from backend.engine.ai_controller import process_copilot_query

router = APIRouter(prefix="/copilot", tags=["AI Finance Controller Copilot"])

class CopilotQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000, description="Natural language query or command for the AI Finance Controller")
    case_id: Optional[str] = Field(None, description="Optional target case_id to anchor forensic investigation")

class CopilotQueryResponse(BaseModel):
    intent: str
    response: str
    structured_data: dict
    verified: bool
    latency_ms: float
    model: str

@router.post("/query", response_model=CopilotQueryResponse)
def query_copilot(
    payload: CopilotQueryRequest,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer),
):
    """
    Sovereign AI Finance Controller Agent:
    Executes in-engine semantic routing, context compression, deterministic calculations,
    and anti-hallucination verification without external cloud API dependencies.
    """
    try:
        result = process_copilot_query(
            query=payload.query,
            session=session,
            case_id=payload.case_id
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Controller reasoning failed: {str(e)}"
        )
