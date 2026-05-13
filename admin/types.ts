
export enum SportCategory {
  GENERAL = 'General',
  WARMUP = 'Warm Up',
  TECHNICAL = 'Technical',
  TACTICAL = 'Tactical',
  PHYSICAL = 'Physical'
}

export enum DifficultyLevel {
  U5 = 'U5',
  U7 = 'U7',
  U9 = 'U9',
  U12 = 'U12',
  U16 = 'U16',
  SENIOR = 'SENIOR',
  ALL_AGES = 'ALL_AGES'
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  level?: DifficultyLevel;
  createdAt: string;
}

export interface Student {
  id: string;
  groupId: string;
  firstName: string;
  lastName: string;
  age: number;
  position: string;
  emergencyContact: string;
  notes?: string;
  active: boolean;
  referralCode?: string;
  referredById?: string;
  monthlyFee: number;
  accessRank?: string | null;
  email?: string;
  isSuperAdmin?: boolean;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  groupId: string;
  presentStudentIds: string[];
  sessionNotes?: string;
}

export interface Game {
  id: string;
  title: string;
  description: string;
  category: SportCategory;
  difficulty: DifficultyLevel;
  durationMin: number;
  tags: string[];
}

export interface SessionItem {
  gameId: string;
  durationMin: number;
  notes?: string;
}

export interface Session {
  id: string;
  groupId: string;
  title: string;
  date: string;
  items: SessionItem[];
  totalDuration: number;
  description?: string;
}

export interface SportConfig {
  name: string;
  primaryColor: string;
  isPremium: boolean;
}

export interface DashboardStats {
  totalStudents: number;
  totalGroups: number;
  totalGames: number;
  sessionsThisMonth: number;
  averageAttendance: number;
}

export interface WalletTransaction {
  id: string;
  studentId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  date: string;
}

export interface Receipt {
  id: string;
  date: string;
  amount: number;
  paymentMethod: 'Tarjeta' | 'Transferencia' | 'Efectivo';
  company: string;
  invoiceLink?: string;
}

export type ViewState = 'DASHBOARD' | 'STUDENTS' | 'GAMES' | 'SESSIONS' | 'SETTINGS' | 'AI_COACH' | 'WALLET' | 'ACCESS_MANAGEMENT' | 'RECEIPTS' | 'APPS';
