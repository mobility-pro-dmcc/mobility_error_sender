import json
import urllib.parse
import requests

api_token = "aa01afc2df5ed6c532015b949e1e9426d8a386d4e8bc73cccdc5562faf3c5fad"
api_url = "https://mobilityp.desk365.io/apis/v3/tickets/create_with_attachment"

# ---------------- ticket object ----------------
ticket_object = {
    "email": "ahmed.zaytoon@mobilityp.com",
    "subject": "Error Report from Frappe",
    "description": """<pre>Doctype: Example
Docname: Example
Report: Example
Page: http://example.com
Domain: http://example.com

Message:
Error message

Traceback:
<pre>-</pre></pre>""",
    "status": "open",
    "priority": 1,
    "group": "ERP Team",
    "category": "ERP",
    "custom_fields": {"cf_Due Time": "2026-01-07"}
}

# ---------------- encode JSON into URL query ----------------
url = f"{api_url}"
params = urllib.parse.urlencode({"ticket_object": json.dumps(ticket_object)})

# ---------------- headers ----------------
headers = {
    "Authorization": api_token,
    "accept": "application/json"
}

# ---------------- file upload ----------------
files = {
    # "file": ("/path/to/error_screenshot.png", open("/path/to/error_screenshot.png", "rb"), "image/png")
}

# ---------------- POST request ----------------
response = requests.post(url, params=params, headers=headers, files=files)

print("Status Code:", response.status_code)
try:
    print("Response JSON:", response.json())
except Exception:
    print("Response Text:", response.text)
