export const STEPS = ["Calendar", "Work", "Preferences", "Bank"];

// shortcut: hardcoded list, replace with backend data if companies/modes change often.
export const GIG_COMPANIES: Record<string, string[]> = {
  Deliveroo: ["Bike", "E-bike", "Scooter", "Car"],
  "Uber Eats": ["Bike", "E-bike", "Scooter", "Car"],
  "Just Eat": ["Bike", "E-bike", "Scooter", "Car"],
  Uber: ["Car"],
  Bolt: ["Car"],
  Stuart: ["Bike", "Scooter", "Car", "Van"],
};

export const WORK = {
  title: "What work do you do?",
  subtitle: "Pick your gig companies, then how you do the work for each.",
  otherTitle: "Other work",
  otherName: "e.g. Bar shifts",
  otherPay: "Approx. pay per hour",
  otherAdd: "Add other work",
  currency: "£",
  perHour: "/hr",
  remove: "Remove",
};

export const WELCOME = {
  titlePrefix: "Welcome to ",
  brand: "Giggle!",
  tagline: "Your gig work, planned around your life and bills.",
  cta: "Get Started",
};

export const BUILDING = {
  title: "Building my schedule…",
  subtitle: "Fitting shifts around your week and your bills.",
};

export const NAV = {
  back: "Back",
  next: "Continue",
};

export const CALENDAR = {
  title: "Import calendar data",
  subtitle: "We plan work around what you've already committed to.",
  sources: ["Apple", "Google"],
  icsSource: ".ics file",
  icsLabel: "Import .ics",
  connected: "Connected to",
  connectedNote: "We'll plan around your existing events.",
};

export const PREFS = {
  title: "Describe your schedule preferences",
  subtitle: "Tell us in your own words: hours, days off, anything.",
  label: "Work preferences",
  placeholder:
    "e.g. I work late nights. Keep Sundays free - max 20 hours a week.",
  examples: [
    "I work mornings",
    "I work late at night",
    "Part-time hours only",
    "Keep Sundays free",
  ],
};

export const BANK = {
  title: "Connect your bank",
  subtitle:
    "Upload your banking data so we know what's coming in and going out.",
  drop: "Drop it here",
  drag: "Drag & drop your banking data",
  browse: "or click to browse · .json",
  uploaded: "uploaded",
  next: "Build my schedule",
};
