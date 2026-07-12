const KEY = "support_widget_queue";
const EMAIL = "support_widget_email";

export const storage = {
  getEmail() {
    if (window.frappe && frappe.session && frappe.session.user_email) {
        this.setEmail(frappe.session.user_email);
        return frappe.session.user_email;
    }
    return sessionStorage.getItem(EMAIL)
  },
  setEmail(e) {
    sessionStorage.setItem(EMAIL, e);
  },
  queueMessage(msg) {
    const q = JSON.parse(localStorage.getItem(KEY) || "[]");
    q.push({ ...msg, ts: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(q));
  }
};
