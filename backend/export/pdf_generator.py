import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from backend.data.schema import ReconciliationCase, CaseStatus

def generate_evidence_pack_pdf(case: ReconciliationCase) -> io.BytesIO:
    """
    Generates a PDF Evidence Pack for a given ReconciliationCase.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    
    styles = getSampleStyleSheet()
    title_style = styles['Heading1']
    normal_style = styles['Normal']
    mono_style = ParagraphStyle(
        'Mono', parent=styles['Normal'], fontName='Courier', fontSize=10
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph("LedgerLens Guard — Evidence Pack", title_style))
    elements.append(Spacer(1, 12))
    
    # Overview Table
    data = [
        ["Case ID:", case.case_id],
        ["Exception Code:", case.exception_code],
        ["Severity:", case.severity],
        ["Status:", case.status.value],
        ["Opened At:", case.opened_at.strftime("%Y-%m-%d %H:%M:%S") if case.opened_at else "N/A"]
    ]
    
    table = Table(data, colWidths=[150, 350])
    table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.darkslategray),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))
    
    import html
    # Explanation
    elements.append(Paragraph("System Explanation", styles['Heading2']))
    elements.append(Paragraph(html.escape(case.explanation), normal_style))
    elements.append(Spacer(1, 20))
    
    # Suggested Action
    elements.append(Paragraph("Suggested Action", styles['Heading2']))
    elements.append(Paragraph(html.escape(case.suggested_action), normal_style))
    elements.append(Spacer(1, 20))
    
    # Forensic Identifiers
    elements.append(Paragraph("Forensic Identifiers", styles['Heading2']))
    ids_data = [
        ["Settlement ID:", case.settlement_id or "N/A"],
        ["Payment ID:", case.payment_id or "N/A"],
        ["UTR:", case.utr or "N/A"]
    ]
    
    ids_table = Table(ids_data, colWidths=[150, 350])
    ids_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,0), (1,-1), 'Courier'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.darkslategray),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(ids_table)
    elements.append(Spacer(1, 20))
    
    # Financial Discrepancy
    elements.append(Paragraph("Financial Discrepancy (in ₹)", styles['Heading2']))
    fin_data = [
        ["Expected Net:", f"{(case.expected_paisa / 100):.2f}"],
        ["Actual Credit:", f"{(case.actual_paisa / 100):.2f}"],
        ["Delta:", f"{(case.delta_paisa / 100):.2f}"]
    ]
    
    fin_table = Table(fin_data, colWidths=[150, 350])
    fin_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.darkslategray),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TEXTCOLOR', (1,2), (1,2), colors.red if case.delta_paisa != 0 else colors.green),
    ]))
    elements.append(fin_table)
    elements.append(Spacer(1, 20))
    
    # Resolution Status
    if case.status != CaseStatus.OPEN:
        elements.append(Paragraph("Resolution Detail", styles['Heading2']))
        res_data = [
            ["Resolved By:", case.resolved_by or "N/A"],
            ["Resolved At:", case.resolved_at.strftime("%Y-%m-%d %H:%M:%S") if case.resolved_at else "N/A"],
            ["Audit Block Index:", str(case.audit_block_id) if case.audit_block_id is not None else "N/A"]
        ]
        res_table = Table(res_data, colWidths=[150, 350])
        res_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.darkslategray),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))
        elements.append(res_table)
        
    doc.build(elements)
    buffer.seek(0)
    return buffer
