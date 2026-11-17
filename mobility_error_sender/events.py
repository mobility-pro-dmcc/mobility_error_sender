import base64
import json
import re

import requests
import frappe
from frappe.utils.file_manager import save_file

DESK365_BASE = "https://mobilityp.desk365.io/apis/v3"

_DATA_URL_RE = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,(.+)$", re.S)
_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def _decode_screenshot(screenshot):
    """Return {"mime", "ext", "bytes", "data_url"} for a data: URL, or None."""
    if not screenshot:
        return None
    match = _DATA_URL_RE.match(screenshot.strip())
    if not match:
        frappe.log_error("Screenshot is not an image data URL", "send_error_report")
        return None
    mime, b64data = match.groups()
    try:
        file_bytes = base64.b64decode(b64data)
    except Exception as e:
        frappe.log_error(f"Screenshot decode error: {e}", "send_error_report")
        return None
    return {
        "mime": mime,
        "ext": _EXTENSIONS[mime],
        "bytes": file_bytes,
        "data_url": f"data:{mime};base64,{b64data}",
    }


def _build_description(message, shot):
    html = f"<pre>{message or '-'}</pre>"
    if shot:
        # embedded in the ticket body instead of being sent as an attachment
        html += (
            "<p><br></p><p><b>Screenshot:</b></p>"
            f'<p><img src="{shot["data_url"]}" alt="screenshot" style="max-width: 100%;"></p>'
        )
    return html


def _keep_screenshot_if_stripped(ticket_number, headers, shot):
    """Desk365 does not document data: images in descriptions. If the image did
    not survive, add it to the ticket as a private note with the file attached
    so the screenshot is never lost."""
    try:
        details = requests.get(
            f"{DESK365_BASE}/tickets/details",
            headers=headers,
            params={"ticket_number": ticket_number},
            timeout=20,
        ).json()
        if "<img" in (details.get("description") or ""):
            return "inline"

        resp = requests.post(
            f"{DESK365_BASE}/tickets/add_note_with_attachment",
            headers=headers,
            data={
                "ticket_number": str(ticket_number),
                "note_object": json.dumps({"body": "Screenshot", "private_note": 1}),
            },
            files=[("files", (f"error_screenshot.{shot['ext']}", shot["bytes"], shot["mime"]))],
            timeout=60,
        )
        if resp.status_code not in (200, 201):
            frappe.log_error(
                message=f"Screenshot note failed ({resp.status_code}): {resp.text}",
                title="send_error_report",
            )
            return "lost"
        return "note"
    except Exception:
        frappe.log_error(title="send_error_report: screenshot check failed")
        return "unknown"


@frappe.whitelist()
def send_error_report(context=None, doctype=None, title=None, docname=None,
                      report_name=None, page_link=None, message=None,
                      traceback=None, user=None, domain=None, screenshot=None, doc_dict=None,
                      message_type=None):
    """Send error / message details to Desk365 as a ticket with the screenshot embedded."""

    # ---------------- decode screenshot & save internally ----------------
    shot = _decode_screenshot(screenshot)
    if shot:
        try:
            save_file(f"error_screenshot.{shot['ext']}", shot["bytes"], None, None, is_private=True)
        except Exception as e:
            frappe.log_error(f"Screenshot save error: {e}", "send_error_report")

    # ---------------- desk365 credentials ----------------
    api_token = frappe.get_single("desk365").get_password("api_token")
    api_url = f"{DESK365_BASE}/tickets/create_with_attachment"

    # ---------------- build the JSON ticket object ----------------
    user = json.loads(user) if user else frappe.session.user
    email_addr = (user.get("email") if isinstance(user, dict) else user) or "noreply@mobilityp.com"
    frappe.log_error(f"Error report from {email_addr}", "send_error_report")
    try:
        if type(json.loads(traceback)) == list:
            traceback = json.loads(traceback)[0]
    except Exception:
        print("Traceback is not a JSON list")
    description = f"""
Type: {message_type or 'Error'}
Doctype: {doctype or '-'}
Docname: {docname or '-'}
Report: {report_name or '-'}
Page: {page_link or '-'}
Domain: {domain or '-'}

Message:
{message or '-'}

Traceback:
```
{traceback or '-'}
```

Document Snapshot:
{json.dumps(json.loads(doc_dict), indent=4, ensure_ascii=False) if doc_dict else '-'}
    """.strip()
    description_bytes = description.encode("utf-8")
    ticket_object = {
        "email": email_addr,
        "subject": title or "Error Report from Frappe",
        "description": _build_description(message, shot),
        "status": "open",
        "priority": 1,
        "group": "ERP Team",
        "category": "ERP",
        "custom_fields": {
            "cf_Due Time": frappe.utils.add_days(frappe.utils.nowdate(), 2)
        }
    }

    # ---------------- multipart/form-data request ----------------
    # ticket_object goes in the form body (as in Desk365's own curl sample),
    # not the query string: the embedded screenshot is far too big for a URL
    headers = {"Authorization": api_token, "accept": "application/json"}

    files = [(
        "files",
        ("error_report.txt", description_bytes, "text/plain; charset=utf-8")
    )]

    resp = requests.post(
        api_url,
        headers=headers,
        data={"ticket_object": json.dumps(ticket_object)},
        files=files,
        timeout=60,
    )

    if resp.status_code not in (200, 201):
        frappe.log_error(message=f"Desk365 response ({resp.status_code}): {resp.text}", title="send_error_report")
        frappe.throw(f"Desk365 ticket creation failed ({resp.status_code})")

    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text}

    screenshot_status = None
    ticket_number = data.get("ticket_number") if isinstance(data, dict) else None
    if shot and ticket_number:
        screenshot_status = _keep_screenshot_if_stripped(ticket_number, headers, shot)

    return {"success": True, "desk365_response": data, "screenshot": screenshot_status}
