import base64
import json
import requests
import frappe
from frappe.utils.file_manager import save_file

@frappe.whitelist()
def send_error_report(context=None, doctype=None, title=None, docname=None,
                      report_name=None, page_link=None, message=None,
                      traceback=None, user=None, domain=None, screenshot=None):
    """Send error details to Desk365 as a ticket with screenshot."""

    # ---------------- decode screenshot & save internally ----------------
    file_bytes = None
    if screenshot:
        try:
            header, b64data = screenshot.split(",", 1)
            file_bytes = base64.b64decode(b64data)
            save_file("error_screenshot.png", file_bytes, None, None, is_private=True)
        except Exception as e:
            frappe.log_error(f"Screenshot decode error: {e}", "send_error_report")

    # ---------------- desk365 credentials ----------------
    api_token = frappe.get_single("desk365").get_password("api_token")
    api_url = "https://mobilityp.desk365.io/apis/v3/tickets/create_with_attachment"

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
        Doctype: {doctype or '-'}  
        Docname: {docname or '-'}  
        Report: {report_name or '-'}  
        Page: {page_link or '-'}  
        Domain: {domain or '-'}  

        Message:  
        {message or '-'}

        Traceback:  
        ```
        <pre>
        {traceback or '-'}
        </pre>
        ```
    """
    ticket_object = {
        "email": email_addr,
        "subject": title or "Error Report from Frappe",
        "description": f"<pre>{description}</pre>",
        "status": "open",
        "priority": 1,
        "group": "ERP Team",
        "category": "ERP",
        "custom_fields": {
            "cf_Due Time": frappe.utils.add_days(frappe.utils.nowdate(), 2)
        }
    }

    # ---------------- multipart/form-data request ----------------
    params = {"ticket_object": json.dumps(ticket_object)}
    headers = {"Authorization": api_token, "accept": "application/json"}

    files = { "file": "" }
    if file_bytes:
        files["file"] = ("error_screenshot.png", file_bytes, "image/png")

    resp = requests.post(api_url, headers=headers, params=params, files=files)

    if resp.status_code not in (200, 201):
        frappe.log_error(message=f"Desk365 response ({resp.status_code}): {resp.text}", title="send_error_report")
        frappe.throw(f"Desk365 ticket creation failed ({resp.status_code})")

    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text}

    return {"success": True, "desk365_response": data}
