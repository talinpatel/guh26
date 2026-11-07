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
