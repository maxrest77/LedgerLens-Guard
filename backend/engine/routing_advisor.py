import math
from typing import List, Dict, Any, Optional

def calculate_two_proportion_z_score(count1: int, n1: int, count2: int, n2: int) -> float:
    """
    Computes two-proportion z-score for difference in exception rates.
    """
    if n1 <= 0 or n2 <= 0:
        return 0.0
    p1 = count1 / n1
    p2 = count2 / n2
    p_pool = (count1 + count2) / (n1 + n2)
    if p_pool == 0 or p_pool == 1:
        return 0.0
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0
    return abs(p1 - p2) / se

def evaluate_routing_advice(
    psp_summaries: List[Dict[str, Any]],
    min_sample_size: int = 20,
    z_threshold: float = 1.96,  # 95% confidence level
    min_cost_diff_pct: float = 0.15  # minimum 0.15% (15 bps) cost difference
) -> Dict[str, Any]:
    """
    Evaluates multi-gateway performance to generate an advisory routing recommendation.

    Hard Constraints:
    1. Advisory only: Explicitly tagged `is_advisory_only = True`.
    2. Noise discipline:
       - Requires sample size >= min_sample_size for evaluated gateways.
       - Differences must be statistically significant (z >= z_threshold OR cost difference >= min_cost_diff_pct).
       - Stays silent (has_recommendation = False) if differences are statistically insignificant.
    """
    if len(psp_summaries) < 2:
        return {
            "has_recommendation": False,
            "reason": "At least two gateways are required for comparative routing analysis.",
            "is_advisory_only": True,
            "recommendation": None
        }

    # Filter gateways meeting sample size
    eligible = [
        p for p in psp_summaries 
        if (p.get("settlements_count", 0) + p.get("payments_count", 0) >= min_sample_size)
    ]

    if len(eligible) < 2:
        return {
            "has_recommendation": False,
            "reason": f"Insufficient sample size: at least 2 gateways require >= {min_sample_size} transactions for statistical significance.",
            "is_advisory_only": True,
            "recommendation": None
        }

    # Sort gateways by composite quality score:
    # Higher match rate, lower effective MDR rate, lower exception rate
    def score_psp(p: Dict[str, Any]) -> float:
        match_rate = p.get("match_rate", 0.0)
        actual_mdr = p.get("mdr", {}).get("actual_rate_pct", 2.0)
        total_txns = max(1, p.get("settlements_count", 0) + p.get("payments_count", 0))
        exc_rate = (p.get("exception_count", 0) / total_txns) * 100
        # Score formula: match_rate - 15 * actual_mdr - 2 * exc_rate
        return match_rate - (actual_mdr * 15.0) - (exc_rate * 2.0)

    ranked = sorted(eligible, key=score_psp, reverse=True)
    leader = ranked[0]
    benchmark = ranked[1]

    leader_name = leader["psp_provider"]
    benchmark_name = benchmark["psp_provider"]

    leader_txns = leader.get("settlements_count", 0) + leader.get("payments_count", 0)
    benchmark_txns = benchmark.get("settlements_count", 0) + benchmark.get("payments_count", 0)

    leader_mdr = leader.get("mdr", {}).get("actual_rate_pct", 0.0)
    benchmark_mdr = benchmark.get("mdr", {}).get("actual_rate_pct", 0.0)
    cost_diff = benchmark_mdr - leader_mdr  # positive if leader is cheaper

    leader_exc = leader.get("exception_count", 0)
    benchmark_exc = benchmark.get("exception_count", 0)
    
    leader_exc_rate = (leader_exc / leader_txns) * 100 if leader_txns > 0 else 0.0
    benchmark_exc_rate = (benchmark_exc / benchmark_txns) * 100 if benchmark_txns > 0 else 0.0

    exc_rate_reduction = benchmark_exc_rate - leader_exc_rate
    rel_exc_reduction_pct = (
        ((benchmark_exc_rate - leader_exc_rate) / benchmark_exc_rate * 100) 
        if benchmark_exc_rate > 0 else 0.0
    )

    z_score = calculate_two_proportion_z_score(
        leader_exc, leader_txns, benchmark_exc, benchmark_txns
    )

    # Statistical significance check:
    # Must have either a statistically significant exception rate gap (z >= z_threshold)
    # OR a meaningful cost difference (cost_diff >= min_cost_diff_pct)
    is_cost_significant = cost_diff >= min_cost_diff_pct
    is_reliability_significant = (z_score >= z_threshold) and (exc_rate_reduction > 0)

    if not (is_cost_significant or is_reliability_significant):
        return {
            "has_recommendation": False,
            "reason": "Performance variance between active gateways is within normal statistical deviation (p > 0.05). No routing shift recommended.",
            "is_advisory_only": True,
            "recommendation": None,
            "evaluated_gateways": [leader_name, benchmark_name],
            "z_score": round(z_score, 2),
            "cost_diff_pct": round(cost_diff, 3)
        }

    # Synthesize plain-language recommendation with real computed numbers
    text_parts = []
    if is_cost_significant and is_reliability_significant:
        text_parts.append(
            f"{leader_name} demonstrated {cost_diff:.2f}% lower effective MDR fee ({leader_mdr:.2f}% vs {benchmark_mdr:.2f}%) "
            f"and {rel_exc_reduction_pct:.1f}% fewer reconciliation exceptions ({leader_exc_rate:.1f}% vs {benchmark_exc_rate:.1f}%) "
            f"compared to {benchmark_name} across {leader_txns + benchmark_txns} evaluated transactions."
        )
    elif is_cost_significant:
        text_parts.append(
            f"{leader_name} demonstrated {cost_diff:.2f}% lower effective MDR fee ({leader_mdr:.2f}% vs {benchmark_mdr:.2f}%) "
            f"compared to {benchmark_name} with comparable reconciliation exception rates."
        )
    else:
        text_parts.append(
            f"{leader_name} demonstrated superior operational stability with {rel_exc_reduction_pct:.1f}% fewer reconciliation exceptions "
            f"({leader_exc_rate:.1f}% vs {benchmark_exc_rate:.1f}%, z={z_score:.2f}) compared to {benchmark_name} across {leader_txns + benchmark_txns} transactions."
        )

    recommendation_text = (
        f"Advisory Insight: {' '.join(text_parts)} "
        f"Manual review of routing allocation toward {leader_name} is suggested for eligible transaction streams."
    )

    return {
        "has_recommendation": True,
        "is_advisory_only": True,
        "recommendation": recommendation_text,
        "leader_psp": leader_name,
        "benchmark_psp": benchmark_name,
        "cost_advantage_pct": round(cost_diff, 3),
        "exception_reduction_pct": round(rel_exc_reduction_pct, 1),
        "z_score": round(z_score, 2),
        "evaluated_gateways": [leader_name, benchmark_name],
        "total_evaluated_txns": leader_txns + benchmark_txns
    }
