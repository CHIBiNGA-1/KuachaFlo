from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Receipt, Category, Report
from app.schemas import ReportOut
from app.pdf_report import generate_report_pdf
from app.storage import save_report_pdf, signed_report_url, uses_supabase_storage

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.post("")
def create_report(
    period_start: date | None = None,
    period_end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Generates a PDF expense report for the given period (all-time if both
    are omitted) and returns the PDF directly. Also persists it so it shows
    up in report history via GET /api/v1/reports.
    """
    query = db.query(Receipt).filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712
    if period_start:
        query = query.filter(Receipt.purchase_date >= period_start)
    if period_end:
        query = query.filter(Receipt.purchase_date <= period_end)
    receipts = query.all()

    if not receipts:
        raise HTTPException(400, "No receipts in this period to report on")

    category_names = {c.id: c.name for c in db.query(Category).all()}

    if period_start and period_end:
        period_label = f"{period_start.isoformat()} to {period_end.isoformat()}"
    elif period_start:
        period_label = f"From {period_start.isoformat()}"
    elif period_end:
        period_label = f"Through {period_end.isoformat()}"
    else:
        period_label = "All time"

    receipt_dicts = [
        {
            "merchant": r.merchant,
            "purchase_date": r.purchase_date,
            "total_amount": float(r.total_amount) if r.total_amount is not None else None,
            "currency": r.currency,
            "category_id": r.category_id,
        }
        for r in receipts
    ]

    pdf_bytes = generate_report_pdf(user.email, receipt_dicts, category_names, period_label)
    pdf_path = save_report_pdf(pdf_bytes, user.id)
    total_amount = sum(r["total_amount"] or 0 for r in receipt_dicts)

    report = Report(
        user_id=user.id,
        period_start=period_start,
        period_end=period_end,
        pdf_path=pdf_path,
        total_amount=total_amount,
        receipt_count=len(receipts),
    )
    db.add(report)
    db.commit()

    filename = f"kuachaflo-report-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=list[ReportOut])
def list_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Report)
        .filter(Report.user_id == user.id)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Ownership check baked into the query itself — a user can't download
    # another user's report just by guessing an id.
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == user.id).first()
    if report is None:
        raise HTTPException(404, "Report not found")

    if uses_supabase_storage():
        # report.pdf_path is a bucket-relative key ("{user_id}/{uuid}.pdf")
        # in the private reports bucket — exchange it for a short-lived
        # signed URL rather than serving the file ourselves.
        return RedirectResponse(signed_report_url(report.pdf_path))

    return FileResponse(
        report.pdf_path,
        media_type="application/pdf",
        filename=f"kuachaflo-report-{report.created_at.strftime('%Y%m%d')}.pdf",
    )
