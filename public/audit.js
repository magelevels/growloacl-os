const form = document.querySelector("#audit-form");
const errorBox = document.querySelector("#form-error");
const success = document.querySelector("#audit-success");

function track(name, properties = {}) {
  window.growlocalAnalytics?.track(name, properties);
}

function clearErrors() {
  errorBox.hidden = true;
  errorBox.textContent = "";
  form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
}

form?.addEventListener("focusin", () => {
  track("audit_form_started", { form_type: "growth_audit" });
}, { once: true });

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  if (!form.reportValidity()) return;

  const button = form.querySelector("button[type='submit']");
  const data = Object.fromEntries(new FormData(form));
  data.consent = form.elements.consent.checked;
  data.turnstileToken = form.elements["cf-turnstile-response"]?.value || "";
  button.disabled = true;
  button.textContent = "Saving your request…";
  track("audit_request_submitted", { form_type: "growth_audit" });

  try {
    const response = await fetch("/api/audit-request", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const invalidNames = Object.keys(result.fields || {});
      invalidNames.forEach((name) => form.elements[name]?.setAttribute("aria-invalid", "true"));
      form.elements[invalidNames[0]]?.focus();
      throw new Error(result.error || "We could not save your request. Please try again.");
    }
    form.hidden = true;
    success.hidden = false;
    if (result.reference) success.querySelector(".reference").textContent = `Reference: ${result.reference}`;
    success.focus();
    track("audit_request_completed", { form_type: "growth_audit" });
  } catch (error) {
    track("audit_request_failed", { form_type: "growth_audit", status: "request_error" });
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Request my free growth audit";
  }
});
