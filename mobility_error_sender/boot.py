import frappe
from frappe.utils import cint

SETTINGS_EVENT = "mobility_error_sender_settings"


def get_support_settings(doc=None):
	"""Support-button settings for the desk (no secrets).

	`doc` is passed right after a save; otherwise the stored settings are read."""
	if doc is None:
		try:
			doc = frappe.get_cached_doc("desk365")
		except Exception:
			doc = None
		# raw stored values: a Single's never-saved Check field would otherwise read as 0
		stored = frappe.db.get_singles_dict("desk365")
	else:
		stored = doc.as_dict()

	def check(fieldname, default):
		value = stored.get(fieldname)
		return default if value is None else cint(value)

	return {
		"show_on_errors": check("show_on_errors", 1),
		"show_on_messages": check("show_on_messages", 0),
		"screenshot_method": stored.get("screenshot_method") or "Browser Capture",
		"rules": [
			{
				"applies_to": row.applies_to or "Both",
				"match_type": row.match_type or "Contains",
				"match_text": row.match_text or "",
				"action": row.action or "Hide Button",
			}
			for row in ((doc.get("support_button_rules") or []) if doc else [])
			if row.match_text
		],
	}


def boot_session(bootinfo):
	if frappe.session.user == "Guest":
		return
	bootinfo.mobility_error_sender = get_support_settings()


def publish_support_settings(doc):
	"""Push new settings to every open desk tab, so no reload is needed."""
	frappe.publish_realtime(SETTINGS_EVENT, get_support_settings(doc), after_commit=True)
