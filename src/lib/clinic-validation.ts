// Validation rules for the New / Edit Clinic dialogs (QA #24).
// US-only — state must be a 2-letter code or full name; phone must be 10 digits.

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
];

const STATE_CODES = new Set(US_STATES.map(s => s.code));
const STATE_NAMES = new Set(US_STATES.map(s => s.name.toLowerCase()));

const isAllSameChar = (s: string) => s.length > 0 && s.split("").every(c => c === s[0]);

export type FieldError = { field: string; message: string };

export function validateName(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Name is required";
  if (v.length < 2) return "Name must be at least 2 characters";
  if (v.length > 100) return "Name must be 100 characters or fewer";
  if (isAllSameChar(v.replace(/\s/g, ""))) return "Name can't be a single repeated character";
  return null;
}

export function validateAddress(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Address is required";
  if (v.length < 5) return "Address looks too short — include street number and name";
  if (v.length > 200) return "Address must be 200 characters or fewer";
  const stripped = v.replace(/\s/g, "");
  if (isAllSameChar(stripped)) return "Address can't be a single repeated character";
  // A real US street address has at least one digit (number) and one letter
  if (!/\d/.test(v)) return "Address must include a street number";
  if (!/[a-zA-Z]/.test(v)) return "Address must include a street name";
  return null;
}

export function validateCity(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "City is required";
  if (v.length < 2) return "City must be at least 2 characters";
  if (v.length > 80) return "City must be 80 characters or fewer";
  if (isAllSameChar(v.replace(/\s/g, ""))) return "City can't be a single repeated character";
  // Letters, spaces, hyphens, apostrophes, periods (St. Louis, O'Fallon, Coeur d'Alene)
  if (!/^[a-zA-Z][a-zA-Z\s\-'.]*$/.test(v)) {
    return "City should only contain letters, spaces, hyphens, apostrophes, or periods";
  }
  return null;
}

export function validateState(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "State is required";
  // Accept either "FL" or "Florida"
  if (v.length === 2 && STATE_CODES.has(v.toUpperCase())) return null;
  if (STATE_NAMES.has(v.toLowerCase())) return null;
  return "Enter a valid US state (e.g. FL or Florida)";
}

// Normalise to the 2-letter code on the way to the DB
export function normalizeState(raw: string): string {
  const v = raw.trim();
  if (v.length === 2 && STATE_CODES.has(v.toUpperCase())) return v.toUpperCase();
  const matched = US_STATES.find(s => s.name.toLowerCase() === v.toLowerCase());
  return matched ? matched.code : v;
}

// Phone is optional. If provided, must be a valid US phone (10 digits).
export function validatePhone(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null; // optional
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return null;
  if (digits.length === 10) return null;
  return "Phone must be a valid 10-digit US number (e.g. (555) 123-4567)";
}

export function validateClinicForm(form: {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
}): FieldError[] {
  const errors: FieldError[] = [];
  const checks: [string, string | null][] = [
    ["name", validateName(form.name)],
    ["address", validateAddress(form.address)],
    ["city", validateCity(form.city)],
    ["state", validateState(form.state)],
    ["phone", validatePhone(form.phone)],
  ];
  for (const [field, message] of checks) {
    if (message) errors.push({ field, message });
  }
  return errors;
}
