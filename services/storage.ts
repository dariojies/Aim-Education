
import { Student, Game, Session, AttendanceRecord, DashboardStats, SportConfig, Group, WalletTransaction } from '../types';

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const getLocalData = <T>(key: string): T[] => {
  if (typeof localStorage === 'undefined') return [];
  const data = localStorage.getItem(`aim_data_${key}`);
  return data ? JSON.parse(data) : [];
};

const saveLocalData = <T>(key: string, data: T[]) => {
  localStorage.setItem(`aim_data_${key}`, JSON.stringify(data));
  window.dispatchEvent(new Event('storage_updated'));
};

// GRUPOS
export const getGroups = async (): Promise<Group[]> => getLocalData<Group>('groups');
export const addGroup = async (group: Group): Promise<Group> => {
  const groups = getLocalData<Group>('groups');
  // Si el ID ya existe, lo actualiza (filtra el viejo y añade el nuevo)
  const newGroup = { ...group, id: group.id || generateId() };
  const updated = [...groups.filter(g => g.id !== newGroup.id), newGroup];
  saveLocalData('groups', updated);
  return newGroup;
};
export const removeGroup = async (id: string): Promise<void> => {
  const groups = getLocalData<Group>('groups');
  saveLocalData('groups', groups.filter(g => g.id !== id));
};

// WALLET
export const getWalletTransactions = async (studentId: string): Promise<WalletTransaction[]> => {
  const all = getLocalData<WalletTransaction>('wallet_transactions');
  return all.filter(t => t.studentId === studentId);
};

export const addWalletTransaction = async (tx: WalletTransaction): Promise<void> => {
  const txs = getLocalData<WalletTransaction>('wallet_transactions');
  saveLocalData('wallet_transactions', [...txs, tx]);
};

// ALUMNOS
export const getStudents = async (): Promise<Student[]> => getLocalData<Student>('students');
export const addStudent = async (student: Student): Promise<Student> => {
  const students = getLocalData<Student>('students');
  const newStudent = { 
    ...student, 
    id: student.id || generateId(),
    referralCode: student.referralCode || Math.random().toString(36).substring(2, 8).toUpperCase()
  };
  const updated = [...students.filter(s => s.id !== newStudent.id), newStudent];
  saveLocalData('students', updated);

  // Si fue referido por alguien, creamos una transacción inicial
  if (newStudent.referredById) {
    const bonus = (newStudent.monthlyFee || 0) * 0.01; // 1%
    if (bonus > 0) {
        await addWalletTransaction({
          id: generateId(),
          studentId: newStudent.referredById,
          type: 'CREDIT',
          amount: bonus,
          description: `Bono referido: ${newStudent.firstName}`,
          date: new Date().toISOString()
        });
    }
  }

  return newStudent;
};
export const removeStudent = async (id: string): Promise<void> => {
  const students = getLocalData<Student>('students');
  saveLocalData('students', students.filter(s => s.id !== id));
};

// Otros... (Games, Sessions, Attendance se mantienen igual)
export const getGames = async (): Promise<Game[]> => getLocalData<Game>('games');
export const addGame = async (game: Game): Promise<Game> => {
  const games = getLocalData<Game>('games');
  const newGame = { ...game, id: game.id || generateId() };
  saveLocalData('games', [...games.filter(g => g.id !== newGame.id), newGame]);
  return newGame;
};
export const removeGame = async (id: string): Promise<void> => {
  const games = getLocalData<Game>('games');
  saveLocalData('games', games.filter(g => g.id !== id));
};
export const getSessions = async (): Promise<Session[]> => getLocalData<Session>('sessions');
export const addSession = async (session: Session): Promise<Session> => {
  const sessions = getLocalData<Session>('sessions');
  const newSession = { ...session, id: session.id || generateId() };
  saveLocalData('sessions', [...sessions.filter(s => s.id !== newSession.id), newSession]);
  return newSession;
};
export const removeSession = async (id: string): Promise<void> => {
  const sessions = getLocalData<Session>('sessions');
  saveLocalData('sessions', sessions.filter(s => s.id !== id));
};
export const getAttendance = async (): Promise<AttendanceRecord[]> => getLocalData<AttendanceRecord>('attendance');
export const saveAttendance = async (record: AttendanceRecord): Promise<AttendanceRecord> => {
  const records = getLocalData<AttendanceRecord>('attendance');
  const newRecord = { ...record, id: record.id || generateId() };
  saveLocalData('attendance', [...records, newRecord]);
  return newRecord;
};
export const getStats = async (): Promise<DashboardStats> => {
  const [students, groups, games, sessions] = await Promise.all([getStudents(), getGroups(), getGames(), getSessions()]);
  return { totalStudents: students.length, totalGroups: groups.length, totalGames: games.length, sessionsThisMonth: sessions.length, averageAttendance: 85 };
};
export const getSportConfig = (): SportConfig => {
  const saved = localStorage.getItem('sport_config');
  return saved ? JSON.parse(saved) : { name: 'Fútbol', primaryColor: '#059669', isPremium: false };
};
export const saveSportConfig = (config: SportConfig) => {
  localStorage.setItem('sport_config', JSON.stringify(config));
  window.dispatchEvent(new Event('storage_updated'));
};
