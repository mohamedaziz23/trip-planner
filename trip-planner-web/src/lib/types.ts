export type Role = 'member' | 'admin';

export interface User {
  _id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  baseCurrency: string;
  language: string;
  homeCountry: string | null;
  role: Role;
  isActive: boolean;
  pushEnabled: boolean;
  notificationPrefs?: { forumReplies: boolean; mutedPosts: string[] };
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRef {
  _id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface Travellers {
  adults: number;
  children: number;
  infants: number;
}

export interface TripPreferences {
  tripType: string;
  activities: string[];
  accommodation: string;
  transport: string;
  travellers: Travellers;
  specialNeeds: string[];
}

export interface TripMember {
  user: UserRef;
  role: 'owner' | 'editor';
  joinedAt: string;
}

export interface Trip {
  _id: string;
  title: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  budget: number;
  baseCurrency: string;
  coverUrl: string | null;
  preferences: TripPreferences;
  owner: string;
  members: TripMember[];
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Place {
  _id: string;
  trip: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
  day: number | null;
  startTime: string | null;
  durationMin: number;
  estimatedCost: number;
  order: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  _id: string;
  trip: string;
  label: string;
  amount: number;
  currency: string;
  amountInBase: number;
  rateUsed: number;
  category: string;
  date: string;
  paidBy: UserRef | string;
  receiptUrl: string | null;
  splitBetween: string[];
  createdAt: string;
  updatedAt: string;
  /** set locally while the conversion is an offline estimate */
  pendingConversion?: boolean;
}

export interface ChecklistItem {
  _id: string;
  trip: string;
  label: string;
  quantity: number;
  category: string;
  isPacked: boolean;
  source: 'generated' | 'manual';
  templateKey: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  _id: string;
  trip: string;
  author: UserRef | string;
  place: string | null;
  title: string;
  body: string;
  photos: string[];
  date: string;
  mood: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ForumAuthor {
  _id: string | null;
  name: string;
  avatarUrl: string | null;
}

export interface ForumPost {
  _id: string;
  title: string;
  body: string;
  category: string;
  destinationTags: string[];
  author: ForumAuthor;
  status: 'published' | 'hidden';
  isLocked: boolean;
  upvotes: number;
  replyCount: number;
  hasVoted: boolean;
  isFollowing?: boolean;
  isMuted?: boolean;
  editedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForumReply {
  _id: string;
  post: string;
  parentReply: string | null;
  author: ForumAuthor;
  body: string;
  status: 'published' | 'hidden';
  upvotes: number;
  hasVoted: boolean;
  editedAt: string | null;
  createdAt: string;
  comments: ForumReply[];
}

export interface ExpenseSummary {
  baseCurrency: string;
  budget: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  alert: boolean;
  count: number;
  byCategory: { category: string; total: number }[];
  byDay: { date: string; total: number }[];
  balances: { user: string; name: string; balance: number }[];
  settlements: { from: string; fromName: string; to: string; toName: string; amount: number }[];
}

export interface DayRoute {
  day: number;
  source: 'osrm' | 'estimate';
  legs: { from: string; to: string; distanceKm: number; driveMin: number; walkMin: number }[];
  geometry: [number, number][];
  totalKm: number;
  totalDriveMin: number;
}
