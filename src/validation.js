const LIMITS = Object.freeze({
  contactName: 100,
  email: 254,
  businessName: 160,
  businessType: 100,
  location: 160,
  website: 500,
  growthChallenge: 1500,
  monthlyCustomers: 40,
});

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanWebsite(value) {
  const text = cleanText(value, LIMITS.website);
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString().slice(0, LIMITS.website);
  } catch {
    return null;
  }
}

export function validateAuditRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { form: "Invalid request." } };
  const data = {
    contactName: cleanText(input.contactName, LIMITS.contactName),
    email: cleanText(input.email, LIMITS.email).toLowerCase(),
    businessName: cleanText(input.businessName, LIMITS.businessName),
    businessType: cleanText(input.businessType, LIMITS.businessType),
    location: cleanText(input.location, LIMITS.location),
    website: cleanWebsite(input.website),
    growthChallenge: cleanText(input.growthChallenge, LIMITS.growthChallenge),
    monthlyCustomers: cleanText(input.monthlyCustomers, LIMITS.monthlyCustomers) || null,
  };
  const errors = {};
  if (data.contactName.length < 2) errors.contactName = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Enter a valid email address.";
  if (data.businessName.length < 2) errors.businessName = "Enter your business name.";
  if (!data.businessType) errors.businessType = "Select or enter a business type.";
  if (data.location.length < 2) errors.location = "Enter your town or service area.";
  if (input.website && !data.website) errors.website = "Enter a valid website address.";
  if (data.growthChallenge.length < 10) errors.growthChallenge = "Tell us a little more about the growth challenge.";
  if (input.consent !== true) errors.consent = "Consent is required so we can respond to your request.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
