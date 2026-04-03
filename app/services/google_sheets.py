import gspread
from app.config import settings


def get_sheets_client() -> gspread.Client | None:
    if not settings.google_creds_json or not settings.google_sheets_id:
        return None
    return gspread.service_account_from_dict(settings.google_creds_json)


import traceback

def sync_order_to_sheet(order_id: int, status: str, total: float, name: str, phone: str, delivery: str, items_str: str, admin: str = ""):
    client = get_sheets_client()
    if client is None:
        print("Google Sheets client is not initialized")
        return
        
    status_uk = {
        "pending": "Очікує",
        "in_process": "В роботі",
        "completed": "Виконано",
        "cancelled": "Скасовано",
    }.get(status, status)

    try:
        sheet = client.open_by_key(settings.google_sheets_id).sheet1
        cell = sheet.find(str(order_id), in_column=1)
        if cell:
            sheet.update_cell(cell.row, 2, status_uk)
            sheet.update_cell(cell.row, 8, admin)
        else:
            sheet.append_row([str(order_id), status_uk, str(total), name, phone, delivery, items_str, admin])
    except Exception as e:
        print(f"Failed to sync order to Google Sheets: {e}")
        traceback.print_exc()

def clear_orders_sheet():
    client = get_sheets_client()
    if client is None:
        print("Google Sheets client is not initialized")
        return
        
    try:
        sheet = client.open_by_key(settings.google_sheets_id).sheet1
        try:
            header = sheet.row_values(1)
        except Exception:
            header = []
        sheet.clear()
        if header:
            sheet.append_row(header)
    except Exception as e:
        print(f"Failed to clear Google Sheets: {e}")
        traceback.print_exc()