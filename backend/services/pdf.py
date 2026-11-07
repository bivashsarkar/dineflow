"""PDF invoice generation for table bills (ReportLab)."""

from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BRAND = colors.HexColor("#F96A16")
INK = colors.HexColor("#221E1A")
MUTED = colors.HexColor("#6B6257")
LINE = colors.HexColor("#EDE3CF")
CREAM = colors.HexColor("#FBF7EF")


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "BillTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=19,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "center": ParagraphStyle(
            "BillCenter",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "meta": ParagraphStyle(
            "BillMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=INK,
        ),
        "total": ParagraphStyle(
            "BillTotal",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            textColor=BRAND,
            alignment=TA_RIGHT,
        ),
        "small": ParagraphStyle(
            "BillSmall",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }


def build_bill_pdf(bill: dict, restaurant: dict, table_number) -> bytes:
    """Render a thermal-style invoice and return PDF bytes."""
    s = _styles()
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A5,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title=f"Bill {bill.get('bill_number', '')}",
        author="DineFlow",
    )

    story = []
    story.append(Paragraph((restaurant.get("name") or "Restaurant").upper(), s["title"]))
    address = restaurant.get("address") or ""
    story.append(Paragraph(address or "", s["center"]))
    phone = restaurant.get("phone") or ""
    email = restaurant.get("email") or ""
    contact = " · ".join([p for p in (phone, email) if p])
    if contact:
        story.append(Paragraph(contact, s["center"]))
    story.append(Spacer(1, 6))

    # Meta block ---------------------------------------------------------- #
    created = bill.get("created_at") or bill.get("paid_at") or ""
    try:
        created = datetime.fromisoformat(created).strftime("%d %b %Y, %I:%M %p")
    except (ValueError, TypeError):
        created = str(created)

    meta = [
        ["Bill No", str(bill.get("bill_number", "-")), "Table", str(table_number)],
        ["Date", created, "Status", str(bill.get("status", "unpaid")).upper()],
    ]
    if bill.get("payment_method"):
        meta.append(["Payment", str(bill.get("payment_method")).upper(), "", ""])
    meta_table = Table(meta, colWidths=[22 * mm, 62 * mm, 20 * mm, 60 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
                ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
                ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 8),
                ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
                ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # Items --------------------------------------------------------------- #
    rows = [["Item", "Qty", "Rate", "Amount"]]
    for item in bill.get("items", []):
        rows.append(
            [
                str(item.get("name", ""))[:26],
                str(item.get("qty", 0)),
                f"{float(item.get('price', 0)):.0f}",
                f"{float(item.get('amount', 0)):.0f}",
            ]
        )

    items_table = Table(rows, colWidths=[74 * mm, 16 * mm, 26 * mm, 30 * mm])
    items_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
                ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 8))

    # Totals -------------------------------------------------------------- #
    def _row(label, value, bold=False):
        return [
            Paragraph(
                label,
                ParagraphStyle(
                    "l", fontName="Helvetica-Bold" if bold else "Helvetica",
                    fontSize=8.5, textColor=INK,
                ),
            ),
            Paragraph(
                f"Rs {float(value):,.2f}",
                ParagraphStyle(
                    "r", fontName="Helvetica-Bold" if bold else "Helvetica",
                    fontSize=8.5, textColor=INK, alignment=TA_RIGHT,
                ),
            ),
        ]

    totals = [_row("Subtotal", bill.get("subtotal", 0))]
    if float(bill.get("gst", 0) or 0) > 0:
        rate = float(bill.get("gst_rate", 0) or 0)
        totals.append(_row(f"GST ({rate:g}%)", bill.get("gst", 0)))
    if float(bill.get("discount", 0) or 0) > 0:
        totals.append(_row("Discount", -float(bill.get("discount", 0))))
    totals.append(_row("TOTAL", bill.get("total", 0), bold=True))

    totals_table = Table(totals, colWidths=[60 * mm, 40 * mm])
    totals_table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, -2), (-1, -2), 0.8, INK),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 10))

    if str(bill.get("status")) == "paid":
        stamp = f"PAID · {str(bill.get('payment_method', '')).upper()}"
        story.append(
            Paragraph(
                stamp,
                ParagraphStyle(
                    "paid", fontName="Helvetica-Bold", fontSize=12,
                    textColor=BRAND, alignment=TA_CENTER,
                ),
            )
        )
    else:
        story.append(Paragraph("PAYMENT PENDING — SETTLE AT THE COUNTER", s["center"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Thank you for dining with us!", s["center"]))
    story.append(Paragraph("Powered by DineFlow — Scan. Order. Serve.", s["small"]))

    doc.build(story)
    return buffer.getvalue()
