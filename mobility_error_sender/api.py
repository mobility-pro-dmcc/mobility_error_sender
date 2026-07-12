import frappe, requests, json
from frappe.utils import get_datetime, format_datetime

DESK365_BASE = "https://mobilityp.desk365.io/apis/v3"


@frappe.whitelist(allow_guest=True)
def validate_email(email):
    if not email:
        return False
    
    if frappe.session.user == "Guest":
        frappe.throw("Unauthorized")

    exists = frappe.db.exists("Contact", {"email_id": email})

    return bool(exists)

def get_desk365_headers():
    token = frappe.get_doc("desk365", "desk365").get_password("api_token")

    return {
        "accept": "application/json",
        "Authorization": token
    }

@frappe.whitelist()
def get_tickets(email=None, offset=0):
    if not email:
        frappe.throw("Email is required")

    email = email.strip().lower()
    headers = get_desk365_headers()

    url = f"{DESK365_BASE}/tickets"

    filters = {
        "contact": [email, "mosaab.metwaly@arabiantires.com"]
    }

    params = {
        "ticket_count": 30,
        "offset": 0,
        "include_description": 0,
        "include_custom_fields": 0,
        "include_survey_details": 0,
        "nested_fields": 0,
        "order_by": "created_time",
        "order_type": "desc",
        "filters": json.dumps(filters)
    }

    res = requests.get(url, headers=headers, params=params, timeout=20)

    res.raise_for_status()

    data = res.json()

    tickets = []

    for t in data.get("tickets", []):
        tickets.append({
            "id": str(t["ticket_number"]),
            "number": str(t["ticket_number"]),
            "title": t["subject"],
            "status": t["status"]
        })

    return {"tickets": tickets}

@frappe.whitelist()
def get_ticket(id):

    if frappe.session.user == "Guest":
        frappe.throw("Unauthorized")

    headers = get_desk365_headers()

    # ---------- 1. Ticket details ----------
    details = requests.get(
        f"{DESK365_BASE}/tickets/details",
        headers=headers,
        params={"ticket_number": id},
        timeout=20
    ).json()

    # ---------- 2. Conversations ----------
    conv = requests.get(
        f"{DESK365_BASE}/tickets/conversations",
        headers=headers,
        params={
            "ticket_number": id,
            "sort_by": "earliest_on_top",
            "include_contact_replies": 1,
            "include_agent_replies": 1,
            "include_private_notes": 1,
            "include_public_notes": 1,
            "include_forward_messages": 1
        },
        timeout=20
    ).json()

    messages = []

    # ---------- 3. Description ----------
    if details.get("description"):
        content = (
            build_sender_header(
                details.get("contact_email"),
                details.get("contact_name")
            )
            + details["description"]
        )

        # add description attachments
        attachments = details.get("attachments", [])

        for att in attachments:
            content += build_attachment_html(att)

        messages.append({
            "type": "user",
            "content": content,
            "time": format_datetime(
                get_datetime(details["created_on"]),
                "hh:mm a"
            )
        })

    # ---------- 4. Conversations ----------
    for c in conv.get("conversations", []):

        # skip private notes
        if c.get("type") == "note" and not c.get("public_note"):
            continue

        msg_type = c.get("sender_type", "contact")

        msg_type = "agent" if msg_type == "agent" else "user"

        sender_email = c.get("created_by")
        sender_name = c.get("creator_name")

        content = (
            build_sender_header(sender_email, sender_name)
            + c.get("body", "")
        )

        # conversation attachments
        for att in c.get("attachments", []):
            content += build_attachment_html(att)

        messages.append({
            "type": msg_type,
            "content": content,
            "time": format_datetime(
                get_datetime(c["created_on"]),
                "hh:mm a"
            )
        })

    return {
        "id": str(details["ticket_number"]),
        "number": str(details["ticket_number"]),
        "title": details["subject"],
        "status": details["status"],
        "messages": messages
    }

def build_attachment_html(att):
    url = att.get("attachment_url")
    file_name = att.get("file_name", "")

    if not url:
        return ""

    lower = file_name.lower()

    # Images
    if lower.endswith(("png", "jpg", "jpeg", "gif", "webp")):
        return f"""
        <div>
            <img src="{url}"
                 style="max-width:200px;border-radius:10px;margin-top:6px;" />
        </div>
        """

    # Audio
    if lower.endswith(("mp3", "wav", "webm", "ogg")):
        return f"""
        <div>
            <audio controls src="{url}" style="margin-top:6px;"></audio>
        </div>
        """

    # Other files
    return f"""
    <div style="margin-top:6px;">
        <a href="{url}" target="_blank">📎 {file_name}</a>
    </div>
    """

def build_sender_header(email, name=None):
    if not email:
        return ""

    display = name or email

    return f"""
    <div style="
        font-size:11px;
        color:#6b7280;
        margin-bottom:4px;
        font-weight:500;
    ">
        {display}
    </div>
    """
