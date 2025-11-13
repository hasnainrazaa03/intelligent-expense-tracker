export const CATEGORIES = {
  'Education': ['Tuition', 'Books & Supplies', 'Course Fees', 'Technology', 'Supplies', 'Visa Fees'],
  'Housing': ['Rent', 'Utilities', 'Internet', 'Renters Insurance', 'Furniture', 'Household Items'],
  'Healthcare': ['Insurance Premium', 'Medical Expenses', 'Dental & Vision', 'Prescriptions'],
  'Food': ['Groceries', 'Dining Out', 'Coffee & Snacks', 'Meal Plan'],
  'Transportation': ['Public Transit', 'Fuel', 'Car Insurance', 'Maintenance', 'Rideshare', 'Parking'],
  'Personal': ['Phone', 'Clothing', 'Entertainment', 'Fitness', 'Personal Care', 'Subscriptions'],
  'Travel': ['Home Visits', 'Local Travel', 'Airfare', 'Accommodation'],
  'Miscellaneous': ['Emergency Fund', 'Gifts', 'Other'],
};

// Flattened list of all subcategories
export const ALL_SUBCATEGORIES: string[] = Object.values(CATEGORIES).flat();

// Map from subcategory to main category for easy lookup
export const SUBCATEGORY_TO_CATEGORY_MAP: { [key: string]: string } = {};
for (const category in CATEGORIES) {
  for (const subcategory of CATEGORIES[category as keyof typeof CATEGORIES]) {
    SUBCATEGORY_TO_CATEGORY_MAP[subcategory] = category;
  }
}

export const INCOME_CATEGORIES = [
    'Salary',
    'Freelance',
    'Investment',
    'Gift',
    'Rental Income',
    'Side Hustle',
    'Other'
];

export const CATEGORY_COLORS: { [key: string]: string } = {
  'Education': '#ef4444',
  'Housing': '#f97316',
  'Food': '#eab308',
  'Healthcare': '#84cc16',
  'Transportation': '#22c55e',
  'Personal': '#3b82f6',
  'Travel': '#8b5cf6',
  'Miscellaneous': '#a8a29e',
};

export const PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'Cash',
  'Bank Transfer',
  'Venmo',
  'PayPal',
  'Apple Pay',
  'Google Pay',
];

export const USC_SEMESTERS: { id: string; name: string; }[] = [
    { id: 'fall-2025', name: 'Fall 2025' },
    { id: 'spring-2026', name: 'Spring 2026' },
    { id: 'summer-2026', name: 'Summer 2026' },
    { id: 'fall-2026', name: 'Fall 2026' },
    { id: 'spring-2027', name: 'Spring 2027' },
    { id: 'fall-2027', name: 'Fall 2027' },
];