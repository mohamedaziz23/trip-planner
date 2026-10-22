// Mirrors of the API enums (trip-planner-api/src/modules/*/*.model.ts)

export const TRIP_TYPES = ['beach', 'mountain', 'city break', 'road trip', 'camping', 'business', 'pilgrimage'];
export const ACTIVITIES = ['hiking', 'swimming', 'diving', 'photography', 'skiing', 'nightlife', 'museums'];
export const ACCOMMODATIONS = ['hotel', 'hostel', 'apartment', 'tent', 'family'];
export const TRANSPORTS = ['plane', 'car', 'train', 'bus'];
export const SPECIAL_NEEDS = ['with a baby', 'formal event', 'driving abroad', 'modest dress required'];

export const PLACE_CATEGORIES = [
  'sight', 'museum', 'restaurant', 'cafe', 'hotel', 'nature', 'beach', 'shopping', 'nightlife', 'transport', 'other',
];
export const EXPENSE_CATEGORIES = ['accommodation', 'transport', 'food', 'activities', 'shopping', 'health', 'other'];
export const CHECKLIST_CATEGORIES = [
  'documents', 'clothing', 'toiletries', 'health', 'electronics', 'gear', 'baby', 'money', 'other',
];
export const MOODS: { value: string; label: string; emoji: string }[] = [
  { value: 'amazing', label: 'Amazing', emoji: '🤩' },
  { value: 'happy', label: 'Happy', emoji: '😊' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'sad', label: 'Sad', emoji: '😢' },
];
export const FORUM_CATEGORIES = [
  'destinations', 'budget and tips', 'transport', 'accommodation', 'food', 'safety', 'equipment', 'trip reports',
];

export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'TND', 'MAD', 'DZD', 'EGP', 'TRY', 'AED', 'SAR', 'QAR', 'JPY', 'CNY', 'KRW', 'INR',
  'THB', 'IDR', 'SGD', 'HKD', 'CAD', 'AUD', 'NZD', 'BRL', 'MXN', 'ARS', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'HUF', 'RON',
];

/** Day colours for map markers and itinerary (distinct, readable on white). */
export const DAY_COLORS = [
  '#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#a21caf', '#c2410c', '#0369a1', '#4d7c0f',
];
export const dayColor = (day: number | null) => (day ? DAY_COLORS[(day - 1) % DAY_COLORS.length] : '#6b7280');

export const COUNTRIES: [string, string][] = [
  ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Belgium'], ['BR', 'Brazil'], ['CA', 'Canada'],
  ['CL', 'Chile'], ['CN', 'China'], ['HR', 'Croatia'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['DZ', 'Algeria'],
  ['EG', 'Egypt'], ['FI', 'Finland'], ['FR', 'France'], ['DE', 'Germany'], ['GR', 'Greece'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IE', 'Ireland'], ['IT', 'Italy'], ['JP', 'Japan'],
  ['JO', 'Jordan'], ['KE', 'Kenya'], ['KR', 'South Korea'], ['LB', 'Lebanon'], ['MY', 'Malaysia'], ['MV', 'Maldives'],
  ['MT', 'Malta'], ['MX', 'Mexico'], ['MA', 'Morocco'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NO', 'Norway'],
  ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'], ['QA', 'Qatar'], ['RO', 'Romania'],
  ['SA', 'Saudi Arabia'], ['SG', 'Singapore'], ['ZA', 'South Africa'], ['ES', 'Spain'], ['SE', 'Sweden'],
  ['CH', 'Switzerland'], ['TH', 'Thailand'], ['TN', 'Tunisia'], ['TR', 'Türkiye'], ['AE', 'United Arab Emirates'],
  ['GB', 'United Kingdom'], ['US', 'United States'], ['VN', 'Vietnam'],
];
export const countryName = (code: string | null | undefined) =>
  COUNTRIES.find(([c]) => c === code)?.[1] ?? code ?? '';
