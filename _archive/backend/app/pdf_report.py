"""
Generates a PDF expense report: a summary, a category breakdown, and an
itemized table of every receipt in the period.

Uses fpdf2 — pure Python, no system libraries (unlike WeasyPrint, which
needs pango/cairo installed). Keeps the Docker image exactly as lean as it
was before this feature existed.
"""

from datetime import date, datetime

from fpdf import FPDF

LINE_HEIGHT = 7


class ReportPDF(FPDF):
    subtitle: str = ""

    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 10, "SnapLedger - Expense Report", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, self.subtitle, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def generate_report_pdf(
    user_email: str,
    receipts: list[dict],
    category_names: dict[str, str],
    period_label: str,
) -> bytes:
    """
    receipts: list of dicts with keys merchant, purchase_date, total_amount,
    currency, category_id (matching Receipt columns, already unpacked from
    the ORM so this module has no DB dependency).
    category_names: {category_id: name}
    """
    total = sum(r["total_amount"] or 0 for r in receipts)
    currency = next((r["currency"] for r in receipts if r["currency"]), "USD")
    categorized = [r for r in receipts if r["category_id"]]

    by_category: dict[str, float] = {}
    for r in receipts:
        name = category_names.get(r["category_id"], "Uncategorised")
        by_category[name] = by_category.get(name, 0) + (r["total_amount"] or 0)

    pdf = ReportPDF()
    pdf.subtitle = f"{user_email}  |  {period_label}  |  generated {datetime.utcnow().strftime('%Y-%m-%d')}"
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # --- Summary ---
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Total spend: {currency} {total:,.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Receipts: {len(receipts)}   |   Categorised: {len(categorized)}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # --- Category breakdown ---
    if by_category:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "By category", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(100, LINE_HEIGHT, "Category", border=1, fill=True)
        pdf.cell(40, LINE_HEIGHT, "Amount", border=1, fill=True, align="R")
        pdf.cell(40, LINE_HEIGHT, "Share", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        for name, amount in sorted(by_category.items(), key=lambda x: -x[1]):
            pct = (amount / total * 100) if total else 0
            pdf.cell(100, LINE_HEIGHT, name[:45], border=1)
            pdf.cell(40, LINE_HEIGHT, f"{currency} {amount:,.2f}", border=1, align="R")
            pdf.cell(40, LINE_HEIGHT, f"{pct:.1f}%", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

    # --- Itemized receipts ---
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "All receipts", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(28, LINE_HEIGHT, "Date", border=1, fill=True)
    pdf.cell(70, LINE_HEIGHT, "Merchant", border=1, fill=True)
    pdf.cell(47, LINE_HEIGHT, "Category", border=1, fill=True)
    pdf.cell(35, LINE_HEIGHT, "Amount", border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)

    sorted_receipts = sorted(receipts, key=lambda r: r["purchase_date"] or date.min, reverse=True)
    for r in sorted_receipts:
        cat_name = category_names.get(r["category_id"], "-")
        merchant = (r["merchant"] or "Unknown")[:38]
        date_str = r["purchase_date"].strftime("%Y-%m-%d") if r["purchase_date"] else "-"
        amount_str = f"{r['currency']} {r['total_amount']:,.2f}" if r["total_amount"] is not None else "-"

        pdf.cell(28, LINE_HEIGHT, date_str, border=1)
        pdf.cell(70, LINE_HEIGHT, merchant, border=1)
        pdf.cell(47, LINE_HEIGHT, cat_name[:28], border=1)
        pdf.cell(35, LINE_HEIGHT, amount_str, border=1, align="R", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
