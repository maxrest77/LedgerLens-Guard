import re
from typing import Dict, Any

def validate_narrative_facts(narrative: str, context: Dict[str, Any]) -> bool:
    """
    Hard validator for AI-generated narrative layer.
    Extracts all numbers, IDs, and dates from the narrative and ensures they 
    exist strictly within the trusted deterministic context facts.
    """
    # Extract all numbers, monetary values, and potential IDs (alphanumeric sequences)
    # Simple regex for words containing digits (including underscores/hyphens)
    tokens = re.findall(r'\b[\w-]*\d[\w-]*\b', narrative)
    
    # Also extract monetary amounts like ?100.00 or 100.00
    monetary = re.findall(r'\d+\.\d{2}', narrative)
    
    all_extracted_facts = set(tokens + monetary)
    
    # Flatten context values to strings for substring/exact match checking
    context_values = set()
    for v in context.values():
        if isinstance(v, (int, float)):
            context_values.add(str(v))
        else:
            context_values.add(str(v))
            
    # Add common safe words that might have numbers (e.g. 3-way, G1)
    safe_words = {"3", "3-way", "1", "2"}
    
    for fact in all_extracted_facts:
        # Check if the extracted fact exists in ANY of the context values
        found = False
        if fact in safe_words:
            continue
            
        for cv in context_values:
            if fact in cv or cv in fact: # substring match for things like ?100.00 and 100.00
                found = True
                break
        
        if not found:
            # Fact hallucinates a number/ID not present in context
            return False
            
    return True

def generate_verified_narrative(deterministic_explanation: str, context: dict) -> str:
    """
    Mock LLM layer that attempts to generate a CFO-friendly narrative.
    Must pass the hard validator or it falls back to the deterministic explanation.
    """
    # In a real app, this calls an LLM. Here we mock it.
    # We will simulate a hallucination if "fabricate" is in context.
    
    if context.get("simulate_hallucination"):
        mock_llm_output = f"The settlement {context.get('settlement_id', 'X')} had a shortfall. The CFO lost 500000 dollars."
    else:
        # A valid generation using only facts in context
        mock_llm_output = f"For settlement {context.get('settlement_id')}, we expected {context.get('expected_net')} but received {context.get('actual_credit')}."
        
    if validate_narrative_facts(mock_llm_output, context):
        return "Executive Summary: " + mock_llm_output
    else:
        # Fallback to deterministic
        return deterministic_explanation
