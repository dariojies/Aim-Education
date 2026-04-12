import { Student, Game, Session, AttendanceRecord, DashboardStats, SportConfig, Group, WalletTransaction } from '../types';

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const BASE_URL = '/api';

const fetchData = async <T>(path: string): Promise<T[]> => {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${path}:`, error);
    return [];
  }
};

const postData = async <T>(path: string, payload: any): Promise<T | null> => {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error posting ${path}:`, error);
    return null;
  }
};

const deleteData = async (path: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error(`Error deleting ${path}:`, error);
    return false;
  }
};

// GRUPOS
export const getGroups = async (): Promise<Group[]> => fetchData<Group>('/groups');
export const addGroup = async (group: Group): Promise<Group> => {
  const newGroup = { ...group, id: group.id || generateId() };
  await postData('/groups', newGroup);
  return newGroup;
};
export const removeGroup = async (id: string): Promise<void> => {
  await deleteData(`/groups/${id}`);
};

// WALLET
export const getWalletTransactions = async (studentId: string): Promise<WalletTransaction[]> => {
  const all = await fetchData<WalletTransaction>('/wallet');
  return all.filter(t => t.studentId === studentId);
};

export const addWalletTransaction = async (tx: WalletTransaction): Promise<void> => {
  await postData('/wallet', tx);
};

// ALUMNOS
export const getStudents = async (): Promise<Student[]> => fetchData<Student>('/students');
export const addStudent = async (student: Student): Promise<Student> => {
  const students = await getStudents();
  let referredById = student.referredById;
  const newStudent = {
    ...student,
    id: student.id || generateId(),
    referralCode: student.referralCode || Math.random().toString(36).substring(2, 8).toUpperCase(),
    referredById
  };

  await postData('/students', newStudent);

  // Bonus for referrer logic
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
  await deleteData(`/students/${id}`);
};

// GAMES
export const getGames = async (): Promise<Game[]> => fetchData<Game>('/games');
export const addGame = async (game: Game): Promise<Game> => {
  const newGame = { ...game, id: game.id || generateId() };
  await postData('/games', newGame);
  return newGame;
};
export const removeGame = async (id: string): Promise<void> => {
  await deleteData(`/games/${id}`);
};

// SESSIONS
export const getSessions = async (): Promise<Session[]> => fetchData<Session>('/sessions');
export const addSession = async (session: Session): Promise<Session> => {
  const newSession = { ...session, id: session.id || generateId() };
  await postData('/sessions', newSession);
  return newSession;
};
export const removeSession = async (id: string): Promise<void> => {
  await deleteData(`/sessions/${id}`);
};

// ATTENDANCE
export const getAttendance = async (): Promise<AttendanceRecord[]> => fetchData<AttendanceRecord>('/attendance');
export const saveAttendance = async (record: AttendanceRecord): Promise<AttendanceRecord> => {
  const newRecord = { ...record, id: record.id || generateId() };
  await postData('/attendance', newRecord);
  return newRecord;
};

// STATS
export const getStats = async (): Promise<DashboardStats> => {
  const [students, groups, games, sessions] = await Promise.all([getStudents(), getGroups(), getGames(), getSessions()]);
  return {
    totalStudents: students.length,
    totalGroups: groups.length,
    totalGames: games.length,
    sessionsThisMonth: sessions.length,
    averageAttendance: 85 // Mock or calc from attendance if needed
  };
};

export const getSportConfig = (): SportConfig => {
  const saved = localStorage.getItem('sport_config');
  return saved ? JSON.parse(saved) : { name: 'Fútbol', primaryColor: '#059669', isPremium: false };
};
export const saveSportConfig = (config: SportConfig) => {
  localStorage.setItem('sport_config', JSON.stringify(config));
  window.dispatchEvent(new Event('storage_updated'));
};
