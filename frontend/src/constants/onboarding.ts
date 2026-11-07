export const STEPS = ["Calendar", "Work", "Preferences", "Bank"];

// shortcut: hardcoded list and rough London base £/hr (before peaks/boosts); replace with real earnings data.
export const GIG_COMPANIES: Record<string, { modes: string[]; rate: number }> = {
  Deliveroo: { modes: ["Bike", "E-bike", "Scooter", "Car"], rate: 14 },
  "Uber Eats": { modes: ["Bike", "E-bike", "Scooter", "Car"], rate: 13 },
  "Just Eat": { modes: ["Bike", "E-bike", "Scooter", "Car"], rate: 12 },
  Uber: { modes: ["Car"], rate: 18 },
  Bolt: { modes: ["Car"], rate: 17 },
  Stuart: { modes: ["Bike", "Scooter", "Car", "Van"], rate: 13 },
};

export const WORK = {
  title: "What work do you do?",
  subtitle: "Pick your main job, then how you do the work.",
  estimate: "Estimated base pay:",
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
  brand: "Giggle",
  tagline: "Your gig work, planned around your life and bills.",
  cta: "Get Started",
};

export const BUILDING = {
  title: "Building my schedule…",
  subtitle: "Fitting shifts around your week and your bills.",
  errorTitle: "Couldn't build your schedule",
  errorNote: "Something went wrong on our side. Your answers are saved, so you can try again.",
  retry: "Try again",
};

export const NAV = {
  back: "Back",
  next: "Continue",
};

export const CALENDAR = {
  title: "Import calendar data",
  subtitle: "Plan gigs around your life.",
  sources: [],
  icsSource: ".ics file",
  icsLabel: "Import .ics",
  connected: "We've imported your calendar",
  connectedNote: "",
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
  browse: "or click to browse · .csv",
  uploaded: "uploaded",
  invalid: "That file doesn't look like a bank statement. Export it as .csv with Date and Amount columns and try again.",
  next: "Build my schedule",
};
