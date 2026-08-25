import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type WeightRecord = { id: string; turtleId: string; weight: string; date: string };
type MeasurementRecord = { id: string; turtleId: string; length: string; weight?: string; detail?: string; width?: string; height?: string; date: string; photo?: string; photoBase64?: string };
type Turtle = { id: string; name: string; species: string; gender: string; weight: string; shellLength: string; notes: string; photo?: string; birthDate?: string; createdAt?: string; weightHistory?: WeightRecord[]; measurementHistory?: MeasurementRecord[] };
type Care = { id: string; label: string; icon: keyof typeof Feather.glyphMap; done: boolean; time?: string };
type Reminder = { id: string; title: string; turtle: string; time: string; repeat: string; active: boolean };
type Log = { id: string; type: string; title: string; turtle: string; detail: string; date: string };
type ExamSection = { status: 'normal' | 'attention' | 'warning'; note: string; imageUri?: string };
type HealthExam = { id: string; turtleId: string; date: string; eyes: ExamSection; nose: ExamSection; mouth: ExamSection; legs: ExamSection; skin: ExamSection; shell: ExamSection; generalCondition: ExamSection; aiSummary?: string; overallStatus: ExamSection['status']; userNotes: string };
type Memory = { id: string; turtleId: string; title: string; description: string; mediaUri?: string; mediaBase64?: string; date: string; createdAt: string };
type Store = { turtles: Turtle[]; care: Care[]; reminders: Reminder[]; logs: Log[]; exams: HealthExam[]; memories: Memory[] };
type DeleteRequest = { kind: 'memory' | 'log' | 'reminder' | 'measurement' | 'exam'; id: string; title: string; message: string };

const initialStore: Store = {
  turtles: [{ id: 'first-turtle', name: 'لاک‌پشت من', species: 'لاک‌پشت ایرانی', gender: 'نامشخص', weight: '850', shellLength: '19', notes: 'به برگ قاصدک علاقه دارد.', createdAt: new Date().toISOString(), weightHistory: [{ id: 'initial-weight', turtleId: 'first-turtle', weight: '850', date: new Date().toISOString() }], measurementHistory: [{ id: 'initial-measurement', turtleId: 'first-turtle', length: '19', date: new Date().toISOString() }] }],
  care: [
    { id: 'feed', label: 'غذا دادن', icon: 'coffee', done: true, time: '۱۰:۱۴' },
    { id: 'water', label: 'تعویض آب', icon: 'droplet', done: false },
    { id: 'sun', label: 'نور خورشید / UV', icon: 'sun', done: false },
    { id: 'weight', label: 'بررسی وزن', icon: 'activity', done: false },
  ],
  reminders: [{ id: 'r1', title: 'زمان غذا', turtle: 'لاک‌پشت من', time: '10:00', repeat: 'هر روز', active: true }],
  logs: [
    { id: '1', type: 'غذا', title: 'برگ قاصدک', turtle: 'لاک‌پشت من', detail: 'یک مشت کوچک · ۱۰:۱۴', date: 'امروز' },
    { id: '2', type: 'آب', title: 'آب تازه شد', turtle: 'لاک‌پشت من', detail: '۱۸:۲۰', date: 'دیروز' },
  ],
  exams: [],
  memories: [],
};

const key = 'turtle-keeper-store-v2';
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const migrateStore = (value: Store): Store => ({
  ...initialStore,
  ...value,
  exams: value.exams || [],
  memories: value.memories || [],
  turtles: (value.turtles || initialStore.turtles).map((turtle) => ({
    ...turtle,
    createdAt: turtle.createdAt || nowIso(),
    weightHistory: turtle.weightHistory?.length ? turtle.weightHistory : (turtle.weight && turtle.weight !== '—' ? [{ id: `migrated-weight-${turtle.id}`, turtleId: turtle.id, weight: turtle.weight, date: nowIso() }] : []),
    measurementHistory: turtle.measurementHistory?.length ? turtle.measurementHistory : (turtle.shellLength && turtle.shellLength !== '—' ? [{ id: `migrated-measurement-${turtle.id}`, turtleId: turtle.id, length: turtle.shellLength, date: nowIso() }] : []),
  })),
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function HomeScreen() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? colors.dark : colors.light;
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<Store>(initialStore);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<'home' | 'turtles' | 'calendar' | 'reminders' | 'stats' | 'settings' | 'guide' | 'memories' | 'exams'>('home');
  const [modal, setModal] = useState<'turtle' | 'log' | 'measurement' | 'reminder' | null>(null);
  const [examVisible, setExamVisible] = useState(false);
  const [examStep, setExamStep] = useState(0);
  const [memoryVisible, setMemoryVisible] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState({ title: '', description: '', mediaUri: '', mediaBase64: '' });
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [measurementPhoto, setMeasurementPhoto] = useState({ uri: '', base64: '' });
  const [selected, setSelected] = useState<Turtle>(initialStore.turtles[0]);
  const [deleteCandidate, setDeleteCandidate] = useState<Turtle | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [editingTurtleId, setEditingTurtleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activityDay, setActivityDay] = useState<'همه' | 'امروز' | 'دیروز'>('همه');
  const [draft, setDraft] = useState({ name: '', species: '', weight: '', shellLength: '', notes: '', title: '', detail: '', time: '10:00' });
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-flash-lite-latest');
  const [guideText, setGuideText] = useState('');
  const [foodWarning, setFoodWarning] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) {
          try {
            setStore(migrateStore(JSON.parse(raw) as Store));
          } catch {
            // Keep the safe defaults if an older or corrupted snapshot is found.
          }
        }
      })
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    AsyncStorage.multiGet(['turtle-keeper-gemini-key', 'turtle-keeper-gemini-model']).then(([keyEntry, modelEntry]) => {
      if (keyEntry[1]) setGeminiKey(keyEntry[1]);
      if (modelEntry[1]) setGeminiModel(modelEntry[1]);
    });
  }, []);
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(key, JSON.stringify(store));
  }, [hydrated, store]);
  useEffect(() => {
    const current = store.turtles.find((turtle) => turtle.id === selected.id);
    if (current && current !== selected) setSelected(current);
    if (!current && store.turtles[0]) setSelected(store.turtles[0]);
  }, [store.turtles, selected.id]);
  useEffect(() => {
    if (!store.reminders.length) return;
    const syncNotifications = async () => {
      if (typeof Notifications.requestPermissionsAsync !== 'function') return;
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status === 'undetermined') {
        permission = await Notifications.requestPermissionsAsync();
      }
      if (permission.status !== 'granted') return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const reminder of store.reminders.filter((item) => item.active)) {
        const [hour, minute] = reminder.time.split(':').map(Number);
        if (Number.isFinite(hour) && Number.isFinite(minute)) {
          await Notifications.scheduleNotificationAsync({
            content: { title: 'لاک‌پشت‌یار', body: `${reminder.title} برای ${reminder.turtle}` },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
          });
        }
      }
    };
    syncNotifications().catch(() => undefined);
  }, [store.reminders]);
  const doneCount = store.care.filter((x) => x.done).length;
  const filteredLogs = store.logs.filter((x) => `${x.title} ${x.detail} ${x.turtle} ${x.type}`.toLowerCase().includes(search.toLowerCase()) && (activityDay === 'همه' || x.date === activityDay));
  const pct = Math.round((doneCount / store.care.length) * 100);
  const press = (fn: () => void) => { Haptics.selectionAsync(); fn(); };
  useEffect(() => {
    const onBack = () => {
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [tab]);

  const toggleCare = (id: string) => setStore((s) => ({ ...s, care: s.care.map((x) => x.id === id ? { ...x, done: !x.done, time: !x.done ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined } : x) }));
  const resetDraft = () => setDraft({ name: '', species: '', weight: '', shellLength: '', notes: '', title: '', detail: '', time: '10:00' });
  const openTurtleEditor = (turtle?: Turtle) => {
    setEditingTurtleId(turtle?.id || null);
    setDraft(turtle ? { ...draft, name: turtle.name, species: turtle.species, weight: turtle.weight === '—' ? '' : turtle.weight, shellLength: turtle.shellLength === '—' ? '' : turtle.shellLength, notes: turtle.notes } : { ...draft, name: '', species: '', weight: '', shellLength: '', notes: '' });
    setModal('turtle');
  };
  const saveTurtle = () => {
    if (!draft.name.trim()) return Alert.alert('نام لازم است', 'ابتدا برای لاک‌پشت خود یک نام بنویسید.');
    const turtleId = editingTurtleId || uid();
    const previous = editingTurtleId ? store.turtles.find((item) => item.id === editingTurtleId) : undefined;
    const turtle = { id: turtleId, name: draft.name.trim(), species: draft.species || 'لاک‌پشت', gender: editingTurtleId ? selected.gender : 'نامشخص', weight: draft.weight || '—', shellLength: draft.shellLength || '—', notes: draft.notes, photo: previous?.photo, birthDate: previous?.birthDate, createdAt: previous?.createdAt || nowIso(), weightHistory: previous?.weightHistory || (draft.weight ? [{ id: uid(), turtleId, weight: draft.weight, date: nowIso() }] : []), measurementHistory: previous?.measurementHistory || (draft.shellLength ? [{ id: uid(), turtleId, length: draft.shellLength, date: nowIso() }] : []) };
    const previousName = editingTurtleId ? store.turtles.find((item) => item.id === editingTurtleId)?.name : undefined;
    setStore((s) => ({ ...s, turtles: editingTurtleId ? s.turtles.map((item) => item.id === editingTurtleId ? turtle : item) : [...s.turtles, turtle], logs: previousName && previousName !== turtle.name ? s.logs.map((log) => log.turtle === previousName ? { ...log, turtle: turtle.name } : log) : s.logs, reminders: previousName && previousName !== turtle.name ? s.reminders.map((reminder) => reminder.turtle === previousName ? { ...reminder, turtle: turtle.name } : reminder) : s.reminders }));
    setSelected(turtle); setModal(null); setEditingTurtleId(null); resetDraft();
  };
  const deleteTurtle = (turtle: Turtle) => {
    if (store.turtles.length === 1) return Alert.alert('امکان حذف نیست', 'حداقل یک لاک‌پشت باید در برنامه باقی بماند.');
    setDeleteCandidate(turtle);
  };
  const confirmDeleteTurtle = () => {
    if (!deleteCandidate) return;
    const nextTurtle = store.turtles.find((item) => item.id !== deleteCandidate.id);
    setStore((s) => ({ ...s, turtles: s.turtles.filter((item) => item.id !== deleteCandidate.id), logs: s.logs.filter((log) => log.turtle !== deleteCandidate.name), reminders: s.reminders.filter((reminder) => reminder.turtle !== deleteCandidate.name) }));
    if (selected.id === deleteCandidate.id && nextTurtle) setSelected(nextTurtle);
    setDeleteCandidate(null);
  };
  const openLog = (kind: string, log?: Log) => {
    setEditingLogId(log?.id || null);
    setDraft((d) => ({ ...d, title: kind === 'غذا' ? '' : kind === 'آب' ? 'آب تازه شد' : 'نور خورشید / UV', detail: '' }));
    if (log) setDraft((d) => ({ ...d, title: log.title, detail: log.detail }));
    setModal('log');
  };
  const addLog = (type: string) => {
    if (!draft.title.trim()) return Alert.alert('عنوان را وارد کنید', 'بنویسید چه چیزی را ثبت می‌کنید.');
    const existing = editingLogId ? store.logs.find((log) => log.id === editingLogId) : undefined;
    const nextLog: Log = { id: editingLogId || uid(), type: existing?.type || type, title: draft.title.trim(), turtle: selected.name, detail: draft.detail.trim() || 'همین حالا ثبت شد', date: existing?.date || 'امروز' };
    setStore((s) => ({ ...s, logs: editingLogId ? s.logs.map((log) => log.id === editingLogId ? { ...log, ...nextLog } : log) : [nextLog, ...s.logs] }));
    setDraft((d) => ({ ...d, title: '', detail: '' })); setEditingLogId(null); setModal(null);
  };
  const pickMeasurementPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82, base64: true });
    if (!result.canceled && result.assets[0]?.uri) setMeasurementPhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 || '' });
  };
  const addMeasurement = () => {
    if (!draft.weight.trim() && !draft.shellLength.trim()) return Alert.alert('اندازه یا وزن لازم است', 'حداقل یکی از دو مقدار وزن یا طول لاک را وارد کنید.');
    const weight = draft.weight.trim() || selected.weight;
    const shellLength = draft.shellLength.trim() || selected.shellLength;
    const recordedAt = nowIso();
    const measurementId = editingMeasurementId || uid();
    setStore((s) => ({ ...s, turtles: s.turtles.map((turtle) => turtle.id === selected.id ? { ...turtle, weight, shellLength, weightHistory: editingMeasurementId ? (turtle.weightHistory || []).map((record) => record.id === editingMeasurementId || record.date === (turtle.measurementHistory || []).find((item) => item.id === editingMeasurementId)?.date ? { ...record, weight } : record) : [...(turtle.weightHistory || []), ...(draft.weight.trim() ? [{ id: measurementId, turtleId: turtle.id, weight, date: recordedAt }] : [])], measurementHistory: editingMeasurementId ? (turtle.measurementHistory || []).map((record) => record.id === editingMeasurementId ? { ...record, length: shellLength, weight, detail: draft.detail.trim(), photo: measurementPhoto.uri || record.photo, photoBase64: measurementPhoto.base64 || record.photoBase64 } : record) : [...(turtle.measurementHistory || []), ...(draft.shellLength.trim() ? [{ id: measurementId, turtleId: turtle.id, length: shellLength, weight: draft.weight.trim() || undefined, detail: draft.detail.trim() || undefined, date: recordedAt, photo: measurementPhoto.uri || undefined, photoBase64: measurementPhoto.base64 || undefined }] : [])] } : turtle), logs: editingMeasurementId ? s.logs : [{ id: uid(), type: 'اندازه‌گیری', title: `وزن ${weight} گرم · طول لاک ${shellLength} سانتی‌متر`, turtle: selected.name, detail: draft.detail.trim() || 'اندازه‌گیری جدید', date: 'امروز' }, ...s.logs] }));
    setSelected((turtle) => ({ ...turtle, weight, shellLength })); setModal(null); setEditingMeasurementId(null); resetDraft(); setMeasurementPhoto({ uri: '', base64: '' });
  };
  const openMeasurementEditor = (record: MeasurementRecord) => { setEditingMeasurementId(record.id); setDraft((d) => ({ ...d, weight: record.weight || '', shellLength: record.length, detail: record.detail || '' })); setMeasurementPhoto({ uri: record.photo || '', base64: record.photoBase64 || '' }); setModal('measurement'); };
  const confirmDeleteMeasurement = (record: MeasurementRecord) => setDeleteRequest({ kind: 'measurement', id: record.id, title: 'حذف اندازه‌گیری', message: 'این ثبت از روند رشد حذف شود؟' });
  const addReminder = () => {
    if (!draft.title.trim()) return;
    const nextReminder: Reminder = { id: editingReminderId || uid(), title: draft.title, turtle: selected.name, time: draft.time, repeat: 'هر روز', active: editingReminderId ? store.reminders.find((item) => item.id === editingReminderId)?.active ?? true : true };
    setStore((s) => ({ ...s, reminders: editingReminderId ? s.reminders.map((item) => item.id === editingReminderId ? nextReminder : item) : [...s.reminders, nextReminder] }));
    setDraft((d) => ({ ...d, title: '', time: '10:00' })); setEditingReminderId(null); setModal(null);
  };
  const openExam = (exam?: HealthExam) => { setEditingExamId(exam?.id || null); setExamStep(0); setExamVisible(true); };
  const saveExam = (sections: Record<string, ExamSection>, userNotes: string) => {
    const values = Object.values(sections);
    const overallStatus: ExamSection['status'] = values.some((section) => section.status === 'warning') ? 'warning' : values.some((section) => section.status === 'attention') ? 'attention' : 'normal';
    const previous = editingExamId ? store.exams.find((item) => item.id === editingExamId) : undefined;
    const exam: HealthExam = { id: editingExamId || uid(), turtleId: selected.id, date: previous?.date || nowIso(), eyes: sections.eyes, nose: sections.nose, mouth: sections.mouth, legs: sections.legs, skin: sections.skin, shell: sections.shell, generalCondition: sections.generalCondition, overallStatus, userNotes };
    setStore((s) => ({ ...s, exams: editingExamId ? s.exams.map((item) => item.id === editingExamId ? exam : item) : [exam, ...s.exams] }));
    setExamVisible(false); setExamStep(0); setEditingExamId(null);
    Alert.alert('معاینه ذخیره شد', 'نتیجه‌ی معاینه به پرونده‌ی لاک‌پشت اضافه شد.');
  };
  const openMemory = (memory?: Memory) => { setEditingMemoryId(memory?.id || null); setMemoryDraft(memory ? { title: memory.title, description: memory.description, mediaUri: memory.mediaUri || '', mediaBase64: memory.mediaBase64 || '' } : { title: '', description: '', mediaUri: '', mediaBase64: '' }); setMemoryVisible(true); };
  const pickMemoryPhoto = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true }); if (!result.canceled && result.assets[0]?.uri) setMemoryDraft((draft) => ({ ...draft, mediaUri: result.assets[0].uri, mediaBase64: result.assets[0].base64 || '' })); };
  const saveMemory = () => {
    if (!memoryDraft.title.trim()) return Alert.alert('عنوان لازم است', 'برای خاطره یک عنوان بنویسید.');
    const memory: Memory = { id: editingMemoryId || uid(), turtleId: selected.id, title: memoryDraft.title.trim(), description: memoryDraft.description.trim(), mediaUri: memoryDraft.mediaUri || undefined, mediaBase64: memoryDraft.mediaBase64 || undefined, date: editingMemoryId ? store.memories.find((item) => item.id === editingMemoryId)?.date || 'امروز' : 'امروز', createdAt: editingMemoryId ? store.memories.find((item) => item.id === editingMemoryId)?.createdAt || nowIso() : nowIso() };
    setStore((s) => ({ ...s, memories: editingMemoryId ? s.memories.map((item) => item.id === editingMemoryId ? memory : item) : [memory, ...s.memories] }));
    setMemoryVisible(false); setEditingMemoryId(null); setMemoryDraft({ title: '', description: '', mediaUri: '', mediaBase64: '' });
  };
  const confirmDeleteMemory = (memory: Memory) => setDeleteRequest({ kind: 'memory', id: memory.id, title: 'حذف خاطره', message: `خاطره‌ی «${memory.title}» حذف شود؟` });
  const confirmDeleteLog = (log: Log) => setDeleteRequest({ kind: 'log', id: log.id, title: 'حذف فعالیت', message: 'این فعالیت از سوابق حذف شود؟' });
  const confirmDeleteReminder = (reminder: Reminder) => setDeleteRequest({ kind: 'reminder', id: reminder.id, title: 'حذف یادآوری', message: `یادآوری «${reminder.title}» حذف شود؟` });
  const confirmDeleteExam = (exam: HealthExam) => setDeleteRequest({ kind: 'exam', id: exam.id, title: 'حذف معاینه پزشکی', message: 'این سابقه‌ی معاینه حذف شود؟' });
  const applyDeleteRequest = () => {
    if (!deleteRequest) return;
    setStore((s) => {
      if (deleteRequest.kind === 'memory') return { ...s, memories: s.memories.filter((item) => item.id !== deleteRequest.id) };
      if (deleteRequest.kind === 'log') return { ...s, logs: s.logs.filter((item) => item.id !== deleteRequest.id) };
      if (deleteRequest.kind === 'reminder') return { ...s, reminders: s.reminders.filter((item) => item.id !== deleteRequest.id) };
      if (deleteRequest.kind === 'exam') return { ...s, exams: s.exams.filter((item) => item.id !== deleteRequest.id) };
      return {
        ...s,
        turtles: s.turtles.map((turtle) => {
          if (turtle.id !== selected.id) return turtle;
          const removed = (turtle.measurementHistory || []).find((item) => item.id === deleteRequest.id);
          const nextMeasurements = (turtle.measurementHistory || []).filter((item) => item.id !== deleteRequest.id);
          const nextWeights = (turtle.weightHistory || []).filter((item) => item.id !== deleteRequest.id && (!removed || item.date !== removed.date));
          return {
            ...turtle,
            measurementHistory: nextMeasurements,
            weightHistory: nextWeights,
            shellLength: nextMeasurements[nextMeasurements.length - 1]?.length || '—',
            weight: nextWeights[nextWeights.length - 1]?.weight || '—',
          };
        }),
      };
    });
    setDeleteRequest(null);
  };
  const openReminderEditor = (reminder: Reminder) => { setEditingReminderId(reminder.id); setDraft((d) => ({ ...d, title: reminder.title, time: reminder.time })); setModal('reminder'); };
  const pickPhoto = async (turtleId = editingTurtleId || selected.id) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      const photo = result.assets[0]?.uri;
      if (photo) {
        setStore((s) => ({ ...s, turtles: s.turtles.map((t) => t.id === turtleId ? { ...t, photo } : t) }));
        setSelected((t) => t.id === turtleId ? { ...t, photo } : t);
      }
    }
  };
  const exportData = async () => {
    try {
      const backup = JSON.stringify({ app: 'turtle-keeper', version: 1, exportedAt: nowIso(), data: store }, null, 2);
      await AsyncStorage.setItem('turtle-keeper-last-export', backup);
      const filename = 'turtle_keeper_backup.json';
      if (Platform.OS === 'web') {
        const blob = new Blob([backup], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('خروجی آماده شد', `فایل ${filename} دانلود شد.`);
        return;
      }
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, backup, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({ url: uri, title: 'پشتیبان Turtle Keeper', message: 'فایل پشتیبان Turtle Keeper' });
    } catch (error) {
      console.error('Backup export failed', error);
      Alert.alert('خروجی انجام نشد', 'ذخیره یا اشتراک‌گذاری فایل پشتیبان ممکن نشد.');
    }
  };
  const importData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (!uri) throw new Error('Backup file URI was not provided');
      const raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(raw) as { data?: Store } | Store;
      const candidate: Store = 'data' in parsed && parsed.data ? parsed.data : parsed as Store;
      if (!candidate || !Array.isArray(candidate.turtles) || !Array.isArray(candidate.logs)) throw new Error('Invalid backup format');
      const restored = migrateStore(candidate);
      setStore(restored);
      Alert.alert('ورود موفق بود', 'اطلاعات پشتیبان با موفقیت جایگزین داده‌های فعلی شد.');
    } catch (error) {
      console.error('Backup import failed', error);
      Alert.alert('ورود انجام نشد', 'این فایل پشتیبان معتبر نیست یا خواندن آن ممکن نشد.');
    }
  };
  const saveGeminiKey = async () => { await AsyncStorage.multiSet([['turtle-keeper-gemini-key', geminiKey.trim()], ['turtle-keeper-gemini-model', geminiModel.trim() || 'gemini-flash-lite-latest']]); Alert.alert('ذخیره شد', 'کلید و مدل Gemini فقط روی همین دستگاه ذخیره شدند.'); };
  const testNotification = async () => {
    if (typeof Notifications.requestPermissionsAsync !== 'function') return Alert.alert('در پیش‌نمایش وب', 'تست اعلان روی نسخه‌ی نصب‌شده‌ی Android انجام می‌شود.');
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'undetermined') permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') return Alert.alert('مجوز اعلان داده نشد', 'از تنظیمات Android، اعلان‌های Turtle Keeper را فعال کنید.');
    await Notifications.scheduleNotificationAsync({ content: { title: 'تست موفق لاک‌پشت‌یار', body: `اعلان برای ${selected.name} کار می‌کند.` }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false } });
    Alert.alert('تست انجام شد', 'یک اعلان آزمایشی تا ۵ ثانیه‌ی دیگر نمایش داده می‌شود.');
  };
  const askGuide = async () => {
    if (!geminiKey.trim()) { setTab('settings'); Alert.alert('کلید Gemini لازم است', 'ابتدا کلید Google Gemini را در تنظیمات وارد کنید.'); return; }
    setGuideLoading(true); setFoodWarning('');
    const todayFoods = store.logs.filter((log) => log.date === 'امروز' && log.type === 'غذا').map((log) => log.title).join('، ') || 'امروز غذایی ثبت نشده';
    const prompt = `تو راهنمای مراقبت از لاک‌پشت هستی. به فارسی پاسخ بده. برای ${selected.name} یک نکته کوتاه و کاربردی روزانه درباره یکی از این موضوعات بده: نگهداری، تغذیه، سلامت، تولد یا تحرک. غذاهای ثبت‌شده امروز: ${todayFoods}. اگر غذایی مشکوک، سمی یا نامناسب بود، اول با عبارت «هشدار غذایی:» هشدار واضح بده؛ در غیر این صورت با «وضعیت غذا: مناسب به نظر می‌رسد، اما جایگزین دامپزشک نیست.» شروع کن. اطلاعات را قطعی پزشکی بیان نکن و در موارد جدی مراجعه به دامپزشک را توصیه کن.`;
     const latestMeasurement = [...(selected.measurementHistory || [])].reverse().find((record) => record.photoBase64);
     const latestMemory = store.memories.filter((memory) => memory.turtleId === selected.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((memory) => memory.mediaBase64);
     const imageBase64 = latestMeasurement?.photoBase64 || latestMemory?.mediaBase64;
     const imageMimeType = latestMeasurement?.photo ? 'image/jpeg' : latestMemory?.mediaUri ? 'image/jpeg' : undefined;
     const callGemini = async (withImage: boolean) => {
       const parts: Array<Record<string, unknown>> = [{ text: prompt }];
       if (withImage && imageBase64 && imageMimeType) parts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
       const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel.trim() || 'gemini-flash-lite-latest')}:generateContent?key=${encodeURIComponent(geminiKey.trim())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
       const data = await response.json();
       if (!response.ok) throw new Error(data?.error?.message || 'request failed');
       return data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
     };
     try {
       let text: string | undefined;
       if (imageBase64) {
         try { text = await callGemini(true); } catch { text = undefined; }
       }
       if (!text) text = await callGemini(false);
       setGuideText(text || 'پاسخ متنی قابل استفاده‌ای دریافت نشد؛ بعداً دوباره امتحان کنید.');
       if (text?.includes('هشدار غذایی')) setFoodWarning(text);
     } catch {
       setGuideText('راهنما فعلاً در دسترس نیست. اطلاعات ثبت‌شده‌ی شما روی دستگاه محفوظ است.');
     } finally { setGuideLoading(false); }
  };

  const Header = ({ title, sub }: { title: string; sub?: string }) => <View style={[styles.header, { paddingTop: insets.top + 8 }]}>{tab !== 'home' && <Pressable onPress={() => setTab('home')} style={[styles.backButton, { backgroundColor: c.secondary }]}><Feather name="arrow-right" size={19} color={c.primary} /></Pressable>}<View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: c.primary }]}>لاک‌پشت‌یار</Text><Text style={[styles.h1, { color: c.foreground }]}>{title}</Text>{sub && <Text style={[styles.sub, { color: c.mutedForeground }]}>{sub}</Text>}</View><View style={[styles.avatar, { backgroundColor: c.accent }]}><Feather name="sun" size={20} color={c.accentForeground} /></View></View>;
  const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
  const Button = ({ label, icon, onPress, secondary }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; secondary?: boolean }) => <Pressable onPress={() => press(onPress)} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? c.secondary : c.primary, opacity: pressed ? 0.72 : 1 }]}>{icon && <Feather name={icon} size={16} color={secondary ? c.secondaryForeground : c.primaryForeground} />}<Text style={[styles.buttonText, { color: secondary ? c.secondaryForeground : c.primaryForeground }]}>{label}</Text></Pressable>;

  const Home = () => <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
    <Header title="امروز چه خبر؟" sub="روتین مراقبت شما در یک نگاه" />
    <Card style={[styles.progressCard, { backgroundColor: c.primary }]}><View style={styles.rowBetween}><View><Text style={[styles.cardKicker, { color: '#C9E4D1' }]}>مراقبت امروز</Text><Text style={[styles.progressTitle, { color: '#FFFFFF' }]}>{doneCount} از {store.care.length} انجام شده</Text></View><Text style={styles.percent}>{pct}٪</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View><Text style={styles.progressHint}>{pct === 100 ? 'همه کارها انجام شد؛ عالی است.' : 'چند کار کوچک هنوز منتظر شماست.'}</Text></Card>
    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: c.foreground }]}>لاک‌پشت فعال</Text><Text style={[styles.muted, { color: c.mutedForeground }]}>برای ثبت فعالیت انتخاب کنید</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)} style={[styles.turtleChip, { backgroundColor: selected.id === turtle.id ? c.primary : c.secondary, borderColor: selected.id === turtle.id ? c.primary : c.border }]}><Feather name="heart" size={14} color={selected.id === turtle.id ? '#FFFFFF' : c.primary} /><Text style={{ color: selected.id === turtle.id ? '#FFFFFF' : c.foreground, fontWeight: '700', fontSize: 13 }}>{turtle.name}</Text></Pressable>)}</ScrollView>
    <Card><View style={styles.rowBetween}><View><Text style={[styles.cardKicker, { color: c.primary }]}>وضعیت فعلی</Text><Text style={[styles.turtleName, { color: c.foreground, marginTop: 6 }]}>{selected.name}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{selected.species} · {selected.weight} گرم · طول لاک {selected.shellLength} سانتی‌متر</Text></View><View style={[styles.careIcon, { backgroundColor: c.secondary, marginRight: 0 }]}><Feather name="heart" size={20} color={c.primary} /></View></View><View style={styles.miniStats}><Text style={[styles.miniStat, { color: c.foreground }]}>{store.logs.filter((log) => log.turtle === selected.name).length} <Text style={styles.careTime}>فعالیت این لاک‌پشت</Text></Text><Text style={[styles.miniStat, { color: c.foreground }]}>{store.reminders.filter((r) => r.active && r.turtle === selected.name).length} <Text style={styles.careTime}>یادآوری فعال</Text></Text></View></Card>
    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: c.foreground }]}>امروز</Text><Pressable onPress={() => setTab('calendar')}><Text style={[styles.link, { color: c.primary }]}>مشاهده تقویم</Text></Pressable></View>
    <Card>{store.care.map((item) => <Pressable key={item.id} onPress={() => press(() => toggleCare(item.id))} style={styles.careRow}><View style={[styles.careIcon, { backgroundColor: item.done ? '#DCEEE0' : c.secondary }]}><Feather name={item.icon} size={18} color={item.done ? c.primary : c.mutedForeground} /></View><View style={styles.flex}><Text style={[styles.careLabel, { color: c.foreground }, item.done && styles.strike]}>{item.label}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{item.done ? `انجام شد در ${item.time}` : 'امروز انجام شود'}</Text></View><View style={[styles.check, { borderColor: item.done ? c.primary : c.border, backgroundColor: item.done ? c.primary : 'transparent' }]}>{item.done && <Feather name="check" size={14} color="#FFFFFF" />}</View></Pressable>)}</Card>
    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: c.foreground }]}>ثبت سریع</Text><Text style={[styles.muted, { color: c.mutedForeground }]}>برای {selected.name}</Text></View>
    <View style={styles.quickGrid}><Button label="غذا" icon="coffee" onPress={() => openLog('غذا')} secondary /><Button label="آب" icon="droplet" onPress={() => openLog('آب')} secondary /><Button label="نور / UV" icon="sun" onPress={() => openLog('نور')} secondary /></View>
        <View style={styles.quickGrid}><Button label="ثبت وزن و اندازه" icon="activity" onPress={() => { resetDraft(); setModal('measurement'); }} secondary /><Button label="معاینه هفتگی" icon="heart" onPress={openExam} secondary /></View><View style={styles.quickGrid}><Button label="خاطرات من" icon="image" onPress={() => setTab('memories')} secondary /><Button label="معاینه پزشکی" icon="clipboard" onPress={() => setTab('exams')} secondary /></View>
     <Card><View style={styles.rowBetween}><View><Text style={[styles.cardKicker, { color: c.primary }]}>یادآوری بعدی</Text><Text style={[styles.logTitle, { color: c.foreground, marginTop: 6 }]}>{store.reminders.find((r) => r.active)?.title || 'یادآوری جدید بسازید'}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{store.reminders.find((r) => r.active) ? `امروز ساعت ${store.reminders.find((r) => r.active)?.time}` : 'برای نظم بیشتر یک یادآوری اضافه کنید'}</Text></View><Pressable onPress={() => setTab('reminders')}><Feather name="arrow-left" size={20} color={c.primary} /></Pressable></View></Card>
    <Card style={{ backgroundColor: '#EEF5E8' }}><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.cardKicker, { color: c.primary }]}>راهنمای امروز</Text><Text style={[styles.logTitle, { color: c.foreground, marginTop: 6 }]}>نکات اختصاصی برای نگهداری بهتر</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>غذاهای امروز را هم بررسی می‌کنم.</Text></View><Pressable onPress={() => { setTab('guide'); askGuide(); }} style={[styles.guideButton, { backgroundColor: c.primary }]}><Feather name="book-open" size={19} color="#FFFFFF" /></Pressable></View></Card>
     <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: c.foreground }]}>سوابق ثبت‌شده</Text><Text style={[styles.muted, { color: c.mutedForeground }]}>{filteredLogs.filter((log) => log.turtle === selected.name).length} مورد</Text></View>
    <TextInput value={search} onChangeText={setSearch} placeholder="جست‌وجو در فعالیت‌ها..." placeholderTextColor={c.mutedForeground} style={[styles.search, { color: c.foreground, borderColor: c.border, backgroundColor: c.card }]} />
     <View style={styles.quickGrid}>{(['همه', 'امروز', 'دیروز'] as const).map((day) => <Pressable key={day} onPress={() => setActivityDay(day)} style={[styles.filterChip, { backgroundColor: activityDay === day ? c.primary : c.secondary, borderColor: activityDay === day ? c.primary : c.border }]}><Text style={{ color: activityDay === day ? c.primaryForeground : c.secondaryForeground, fontWeight: '700', fontSize: 12 }}>{day}</Text></Pressable>)}</View>
     <Card>{filteredLogs.filter((log) => log.turtle === selected.name).slice(0, 20).map((log) => <View key={log.id} style={styles.logRow}><View style={[styles.dot, { backgroundColor: log.type === 'غذا' ? '#E8B85E' : '#82BBD0' }]} /><View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{log.title}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{log.date} · {log.type} · {log.turtle} · {log.detail}</Text></View><Pressable onPress={() => openLog(log.type, log)} hitSlop={10}><Feather name="edit-2" size={16} color={c.primary} /></Pressable><Pressable onPress={() => confirmDeleteLog(log)} hitSlop={10} style={{ marginLeft: 12 }}><Feather name="trash-2" size={16} color="#C66A62" /></Pressable></View>)}</Card>
  </ScrollView>;

   const Turtles = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="لاک‌پشت‌های من" sub={`${store.turtles.length} همراه دوست‌داشتنی`} /><Button label="افزودن لاک‌پشت" icon="plus" onPress={() => openTurtleEditor()} /><View style={{ height: 14 }} />{store.turtles.map((t) => <Pressable key={t.id} onPress={() => setSelected(t)}><Card style={[styles.turtleCard, selected.id === t.id && { borderColor: c.primary, borderWidth: 2 }]}><View style={[styles.turtlePhoto, { backgroundColor: c.secondary }]}>{t.photo ? <Image source={{ uri: t.photo }} style={styles.image} /> : <Feather name="heart" size={28} color={c.primary} />}</View><View style={styles.flex}><Text style={[styles.turtleName, { color: c.foreground }]}>{t.name}</Text><Text style={[styles.sub, { color: c.mutedForeground }]}>{t.species}</Text><Text style={[styles.meta, { color: c.mutedForeground }]}>{t.weight} گرم  ·  طول لاک {t.shellLength} سانتی‌متر</Text></View><Pressable onPress={() => openTurtleEditor(t)} hitSlop={10}><Feather name="edit-2" size={18} color={c.primary} /></Pressable><Pressable onPress={() => deleteTurtle(t)} hitSlop={10}><Feather name="trash-2" size={18} color="#C66A62" /></Pressable></Card></Pressable>)}</ScrollView>;
   const Calendar = () => {
     const now = new Date();
     const calendarParts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(now);
     const monthLabel = calendarParts.filter((part) => part.type !== 'day').map((part) => part.value).join('').replace(/\s+/g, ' ').trim();
     const todayLabel = calendarParts.filter((part) => part.type === 'day' || part.type === 'month').map((part) => part.value).join(' ').trim();
     const todayDay = Number(new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric' }).format(now));
     return <ScrollView contentContainerStyle={styles.scroll}><Header title="تقویم مراقبت" sub="روتین روزانه‌تان را دنبال کنید" /><Card><Text style={[styles.month, { color: c.foreground }]}>{monthLabel}</Text><View style={styles.week}><Text style={styles.day}>ش</Text><Text style={styles.day}>ی</Text><Text style={styles.day}>د</Text><Text style={styles.day}>س</Text><Text style={styles.day}>چ</Text><Text style={styles.day}>پ</Text><Text style={styles.day}>ج</Text></View><View style={styles.calendarGrid}>{Array.from({ length: 31 }, (_, i) => <View key={i} style={[styles.date, i + 1 === todayDay && { backgroundColor: c.primary }]}><Text style={{ color: i + 1 === todayDay ? '#fff' : c.foreground }}>{new Intl.NumberFormat('fa-IR').format(i + 1)}</Text>{[2, 7, 11, 15, 18, 22].includes(i + 1) && <View style={[styles.dateDot, { backgroundColor: c.accent }]} />}</View>)}</View></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>امروز، {todayLabel}</Text><Card>{store.care.map((item) => <View key={item.id} style={styles.logRow}><Feather name={item.done ? 'check-circle' : 'circle'} size={20} color={item.done ? c.primary : c.mutedForeground} /><Text style={[styles.careLabel, { color: c.foreground, marginLeft: 12 }]}>{item.label}</Text></View>)}</Card></ScrollView>;
   };
  const Reminders = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="یادآوری‌ها" sub="مراقبت را ساده و منظم نگه دارید" /><Button label="یادآوری جدید" icon="plus" onPress={() => { setEditingReminderId(null); setDraft((d) => ({ ...d, title: '', time: '10:00' })); setModal('reminder'); }} /><View style={{ height: 14 }} />{store.reminders.map((r) => <Card key={r.id} style={styles.reminderRow}><View style={[styles.careIcon, { backgroundColor: c.secondary }]}><Feather name="bell" size={18} color={c.primary} /></View><View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{r.title}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{r.turtle} · {r.repeat}، ساعت {r.time}</Text></View><Pressable onPress={() => openReminderEditor(r)} hitSlop={10}><Feather name="edit-2" size={17} color={c.primary} /></Pressable><Pressable onPress={() => confirmDeleteReminder(r)} hitSlop={10} style={{ marginHorizontal: 12 }}><Feather name="trash-2" size={17} color="#C66A62" /></Pressable><Pressable onPress={() => setStore((s) => ({ ...s, reminders: s.reminders.map((x) => x.id === r.id ? { ...x, active: !x.active } : x) }))}><View style={[styles.switch, { backgroundColor: r.active ? c.primary : c.border }]}><View style={[styles.switchKnob, { alignSelf: r.active ? 'flex-end' : 'flex-start' }]} /></View></Pressable></Card>)}</ScrollView>;
   const Stats = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="گزارش‌ها" sub={`روند و وضعیت همه‌ی ${store.turtles.length} لاک‌پشت`} /><Text style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}>تمرکز گزارش</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)} style={[styles.turtleChip, { backgroundColor: selected.id === turtle.id ? c.primary : c.secondary, borderColor: selected.id === turtle.id ? c.primary : c.border }]}><Feather name="heart" size={14} color={selected.id === turtle.id ? '#FFFFFF' : c.primary} /><Text style={{ color: selected.id === turtle.id ? '#FFFFFF' : c.foreground, fontWeight: '700', fontSize: 13 }}>{turtle.name}</Text></Pressable>)}</ScrollView><Card><Text style={[styles.cardKicker, { color: c.primary }]}>وضعیت {selected.name}</Text><Text style={[styles.bigNumber, { color: c.foreground }]}>{selected.weight}<Text style={styles.bigUnit}> گرم</Text></Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>طول لاک: {selected.shellLength} سانتی‌متر · {store.logs.filter((log) => log.turtle === selected.name).length} فعالیت ثبت‌شده</Text></Card><View style={styles.statGrid}>{[['آخرین وزن', `${selected.weight} گرم`, 'activity'], ['فعالیت‌ها', `${store.logs.filter((log) => log.turtle === selected.name).length}`, 'check-circle'], ['یادآوری‌ها', `${store.reminders.filter((reminder) => reminder.turtle === selected.name && reminder.active).length}`, 'bell'], ['یادداشت', selected.notes ? 'دارد' : 'ندارد', 'edit-3']].map(([label, value, icon]) => <Card key={label} style={styles.statCard}><Feather name={icon as keyof typeof Feather.glyphMap} size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{value}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{label}</Text></Card>)}</View><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>خلاصه‌ی همه‌ی لاک‌پشت‌ها</Text>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)}><Card><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.turtleName, { color: c.foreground }]}>{turtle.name}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{turtle.species} · وزن {turtle.weight} گرم · طول لاک {turtle.shellLength} سانتی‌متر</Text></View><Feather name={selected.id === turtle.id ? 'check-circle' : 'chevron-left'} size={20} color={selected.id === turtle.id ? c.primary : c.mutedForeground} /></View></Card></Pressable>)}</ScrollView>;
  const Settings = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="تنظیمات" sub="خصوصی، آفلاین و متعلق به شما" /><Card>{[['bell', 'اعلان‌ها', 'یادآوری‌ها روی همین دستگاه'], ['sun', 'ظاهر برنامه', 'هماهنگ با دستگاه'], ['sliders', 'واحدها', 'متریک (گرم، سانتی‌متر)'], ['globe', 'زبان', 'فارسی']].map(([icon, label, value]) => <View key={label} style={styles.settingRow}><View style={[styles.careIcon, { backgroundColor: c.secondary }]}><Feather name={icon as keyof typeof Feather.glyphMap} size={17} color={c.primary} /></View><View style={styles.flex}><Text style={[styles.careLabel, { color: c.foreground }]}>{label}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{value}</Text></View><Feather name="chevron-left" size={18} color={c.mutedForeground} /></View>)}</Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اعلان‌ها</Text><Card><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>یادآوری‌های فعال هر روز روی همین دستگاه زمان‌بندی می‌شوند. برای اطمینان، اعلان آزمایشی را بفرستید.</Text><Button label="ارسال اعلان آزمایشی" icon="bell" onPress={testNotification} secondary /></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اتصال راهنمای هوشمند</Text><Card><Text style={[styles.careLabel, { color: c.foreground }]}>کلید Google Gemini</Text><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>کلید فقط روی همین دستگاه ذخیره می‌شود و در پشتیبان JSON قرار نمی‌گیرد.</Text><TextInput value={geminiKey} onChangeText={setGeminiKey} secureTextEntry placeholder="کلید Gemini را وارد کنید" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, marginBottom: 12 }]} /><Text style={[styles.careLabel, { color: c.foreground }]}>مدل Gemini</Text><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 8 }]}>نام مدل را دقیق وارد کنید؛ مثلاً gemini-2.5-flash یا gemini-2.5-pro.</Text><TextInput value={geminiModel} onChangeText={setGeminiModel} autoCapitalize="none" placeholder="gemini-2.5-flash" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, marginBottom: 10 }]} /><Button label="ذخیره کلید و مدل" icon="lock" onPress={saveGeminiKey} secondary /><View style={{ height: 10 }} /><Button label="باز کردن راهنما" icon="book-open" onPress={() => setTab('guide')} secondary /></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اطلاعات شما</Text><Card><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>از داده‌های لاک‌پشت‌ها، فعالیت‌ها، یادآوری‌ها، اندازه‌گیری‌ها، خاطرات و معاینه‌های پزشکی یک فایل قابل انتقال ساخته می‌شود.</Text><Button label="خروجی پشتیبان JSON" icon="download" onPress={exportData} secondary /><View style={{ height: 10 }} /><Button label="ورود پشتیبان JSON" icon="upload" onPress={importData} secondary /></Card><Text style={[styles.privacy, { color: c.mutedForeground }]}>اطلاعات شما فقط روی دستگاه ذخیره می‌شود. بدون حساب کاربری، فضای ابری، تبلیغات و تحلیل اجباری.</Text></ScrollView>;
  const Guide = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="راهنمای هوشمند" sub="نکات شخصی‌سازی‌شده برای لاک‌پشت‌ها" /><Card style={{ backgroundColor: c.primary }}><Text style={[styles.cardKicker, { color: '#D9EDDB' }]}>راهنمای روزانه</Text><Text style={[styles.progressTitle, { color: '#FFFFFF' }]}>مراقبت بهتر، با اطلاعات بیشتر</Text><Text style={[styles.progressHint, { marginTop: 8 }]}>Gemini با توجه به فعالیت‌های ثبت‌شده، یک پیشنهاد کوتاه و احتیاطی آماده می‌کند.</Text><View style={{ marginTop: 16 }}><Button label={guideLoading ? 'در حال دریافت...' : 'دریافت نکته جدید'} icon="refresh-cw" onPress={askGuide} secondary /></View></Card>{foodWarning && <Card style={{ backgroundColor: '#FFF4DC', borderColor: '#E8C873' }}><Text style={[styles.cardKicker, { color: '#8B6515' }]}>هشدار غذایی</Text><Text style={[styles.guideText, { color: '#5F4613' }]}>{foodWarning}</Text></Card>}<Card><Text style={[styles.sectionTitle, { color: c.foreground, fontSize: 17 }]}>پاسخ راهنما</Text>{guideLoading ? <ActivityIndicator color={c.primary} style={{ margin: 28 }} /> : <Text style={[styles.guideText, { color: c.foreground }]}>{guideText || 'برای دریافت پیشنهاد، کلید Gemini را در تنظیمات ذخیره کنید و روی «دریافت نکته جدید» بزنید.'}</Text>}</Card><Card><Text style={[styles.cardKicker, { color: c.primary }]}>غذاهای امروز</Text>{store.logs.filter((log) => log.date === 'امروز' && log.type === 'غذا').length ? store.logs.filter((log) => log.date === 'امروز' && log.type === 'غذا').map((log) => <View key={log.id} style={styles.logRow}><Feather name="coffee" size={18} color={c.primary} /><Text style={[styles.careLabel, { color: c.foreground, marginLeft: 12 }]}>{log.title}</Text></View>) : <Text style={[styles.guideText, { color: c.mutedForeground }]}>امروز هنوز غذایی ثبت نشده است.</Text>}</Card><Text style={[styles.privacy, { color: c.mutedForeground }]}>این راهنما جایگزین دامپزشک نیست. در صورت علائم غیرعادی یا احتمال مسمومیت، با دامپزشک تماس بگیرید.</Text></ScrollView>;

  const ExamArchive = () => {
      const exams = store.exams.filter((exam) => exam.turtleId === selected.id);
      const statusLabel = (status: ExamSection['status']) => status === 'warning' ? 'نگران‌کننده' : status === 'attention' ? 'نیازمند پیگیری' : 'طبیعی';
      const statusColor = (status: ExamSection['status']) => status === 'warning' ? '#C66A62' : status === 'attention' ? '#B27A22' : c.primary;
       return <ScrollView contentContainerStyle={styles.scroll}><Header title="معاینه پزشکی" sub={`سوابق بررسی‌های ${selected.name}`} /><Button label="ثبت معاینه‌ی جدید" icon="plus" onPress={openExam} /><View style={{ height: 14 }} />{exams.length ? exams.map((exam) => <Card key={exam.id}><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{new Date(exam.date).toLocaleDateString('fa-IR')}</Text><Text style={[styles.careTime, { color: c.mutedForeground, marginTop: 5 }]}>وضعیت کلی: {statusLabel(exam.overallStatus)}</Text></View><View style={[styles.statusPill, { backgroundColor: c.secondary }]}><Text style={[styles.actionText, { color: statusColor(exam.overallStatus) }]}>{statusLabel(exam.overallStatus)}</Text></View></View><View style={styles.examGrid}>{[['چشم‌ها', exam.eyes], ['بینی', exam.nose], ['دهان', exam.mouth], ['پاها', exam.legs], ['پوست', exam.skin], ['لاک', exam.shell], ['عمومی', exam.generalCondition]].map(([label, section]) => <View key={label as string} style={styles.examItem}><Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>{label as string}</Text><Text style={[styles.examStatus, { color: statusColor((section as ExamSection).status) }]}>{statusLabel((section as ExamSection).status)}</Text>{(section as ExamSection).note ? <Text style={[styles.careTime, { color: c.mutedForeground }]} numberOfLines={2}>{(section as ExamSection).note}</Text> : null}</View>)}</View>{exam.userNotes ? <Text style={[styles.careTime, { color: c.mutedForeground, marginTop: 10 }]}>یادداشت: {exam.userNotes}</Text> : null}<View style={styles.itemActions}><Pressable onPress={() => openExam(exam)} style={[styles.actionButton, { backgroundColor: c.secondary }]}><Feather name="edit-2" size={15} color={c.secondaryForeground} /><Text style={[styles.actionText, { color: c.secondaryForeground }]}>ویرایش</Text></Pressable><Pressable onPress={() => confirmDeleteExam(exam)} style={[styles.actionButton, { backgroundColor: '#FBE9E6' }]}><Feather name="trash-2" size={15} color="#C66A62" /><Text style={[styles.actionText, { color: '#A95049' }]}>حذف سابقه</Text></Pressable></View></Card>) : <Card><Text style={[styles.guideText, { color: c.mutedForeground, textAlign: 'center' }]}>هنوز معاینه‌ای برای این لاک‌پشت ثبت نشده است.</Text></Card>}</ScrollView>;
    };
    const Memories = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="خاطرات من" sub={`لحظه‌های ماندگار ${selected.name}`} /><Button label="خاطره‌ی جدید" icon="plus" onPress={() => openMemory()} /><View style={{ height: 14 }} />{store.memories.filter((memory) => memory.turtleId === selected.id).length ? store.memories.filter((memory) => memory.turtleId === selected.id).map((memory) => <Card key={memory.id}><View style={styles.rowBetween}>{memory.mediaUri ? <Image source={{ uri: memory.mediaUri }} style={{ width: 82, height: 82, borderRadius: 16, marginRight: 12 }} /> : <View style={[styles.turtlePhoto, { backgroundColor: c.secondary, marginRight: 12 }]}><Feather name="heart" size={26} color={c.primary} /></View>}<View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{memory.title}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{memory.date}</Text><Text style={[styles.guideText, { color: c.mutedForeground, marginTop: 7 }]}>{memory.description || 'بدون توضیح'}</Text></View></View><View style={styles.itemActions}><Pressable onPress={() => openMemory(memory)} style={[styles.actionButton, { backgroundColor: c.secondary }]}><Feather name="edit-2" size={15} color={c.secondaryForeground} /><Text style={[styles.actionText, { color: c.secondaryForeground }]}>ویرایش</Text></Pressable><Pressable onPress={() => confirmDeleteMemory(memory)} style={[styles.actionButton, { backgroundColor: '#FBE9E6' }]}><Feather name="trash-2" size={15} color="#C66A62" /><Text style={[styles.actionText, { color: '#A95049' }]}>حذف</Text></Pressable></View></Card>) : <Card><Text style={[styles.guideText, { color: c.mutedForeground, textAlign: 'center' }]}>هنوز خاطره‌ای برای این لاک‌پشت ثبت نشده است.</Text></Card>}</ScrollView>;
  const screen = tab === 'home' ? <Home /> : tab === 'turtles' ? <Turtles /> : tab === 'calendar' ? <Calendar /> : tab === 'reminders' ? <Reminders /> : tab === 'stats' ? <VisualStats store={store} selected={selected} setSelected={setSelected} c={c} onEditMeasurement={openMeasurementEditor} onDeleteMeasurement={confirmDeleteMeasurement} /> : tab === 'guide' ? <Guide /> : tab === 'memories' ? <Memories /> : tab === 'exams' ? <ExamArchive /> : <Settings />;
  const nav = [['home', 'home', 'خانه'], ['turtles', 'heart', 'لاک‌پشت‌ها'], ['calendar', 'calendar', 'تقویم'], ['reminders', 'bell', 'یادآوری'], ['stats', 'bar-chart-2', 'گزارش‌ها'], ['settings', 'settings', 'تنظیمات']] as const;
  return <View style={[styles.container, { backgroundColor: c.background }]}><View style={styles.flex}>{screen}</View><View style={[styles.nav, { backgroundColor: c.card, borderColor: c.border, paddingBottom: Math.max(insets.bottom, 12) }]}>{nav.map(([id, icon, label]) => <Pressable key={id} onPress={() => setTab(id)} style={styles.navItem}><Feather name={icon} size={19} color={tab === id ? c.primary : c.mutedForeground} /><Text style={[styles.navText, { color: tab === id ? c.primary : c.mutedForeground }]}>{label}</Text></Pressable>)}</View>
       <Modal visible={!!modal} animationType="slide" transparent onRequestClose={() => { setModal(null); setEditingTurtleId(null); }}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: c.card, paddingBottom: 0, maxHeight: '92%' }]}><KeyboardAwareScrollViewCompat style={styles.modalScroll} contentContainerStyle={[styles.modalScrollContent, { paddingBottom: Math.max(insets.bottom, 18) + 18 }]} showsVerticalScrollIndicator={false}><View style={styles.rowBetween}><Text style={[styles.modalTitle, { color: c.foreground }]}>{modal === 'turtle' ? (editingTurtleId ? 'ویرایش لاک‌پشت' : 'افزودن لاک‌پشت') : modal === 'measurement' ? (editingMeasurementId ? 'ویرایش اندازه‌گیری' : 'ثبت وزن و اندازه') : modal === 'reminder' ? (editingReminderId ? 'ویرایش یادآوری' : 'یادآوری جدید') : (editingLogId ? 'ویرایش فعالیت' : 'ثبت فعالیت')}</Text><Pressable onPress={() => { setModal(null); setEditingTurtleId(null); }} hitSlop={10}><Feather name="x" size={22} color={c.mutedForeground} /></Pressable></View>{modal === 'turtle' ? <><Field label="نام" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="مثلاً سبزک" c={c} /><Field label="گونه" value={draft.species} onChangeText={(v) => setDraft({ ...draft, species: v })} placeholder="لاک‌پشت ایرانی" c={c} /><View style={styles.two}><Field label="وزن (گرم)" value={draft.weight} onChangeText={(v) => setDraft({ ...draft, weight: v })} placeholder="۸۵۰" c={c} /><Field label="طول لاک (cm)" value={draft.shellLength} onChangeText={(v) => setDraft({ ...draft, shellLength: v })} placeholder="۱۹" c={c} /></View><Field label="یادداشت" value={draft.notes} onChangeText={(v) => setDraft({ ...draft, notes: v })} placeholder="نکته‌ای برای به خاطر سپردن..." c={c} />{editingTurtleId && <Button label="تغییر عکس لاک‌پشت" icon="image" onPress={() => pickPhoto()} secondary />}{editingTurtleId && <View style={{ height: 10 }} />}<Button label={editingTurtleId ? 'ذخیره تغییرات' : 'افزودن لاک‌پشت'} icon="check" onPress={saveTurtle} /></> : modal === 'measurement' ? <><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 12 }]}>برای {selected.name} حداقل یکی از دو مقدار را وارد کنید.</Text><View style={styles.two}><Field label="وزن (گرم)" value={draft.weight} onChangeText={(v) => setDraft({ ...draft, weight: v })} placeholder={selected.weight === '—' ? 'مثلاً ۸۵۰' : selected.weight} c={c} /><Field label="طول لاک (cm)" value={draft.shellLength} onChangeText={(v) => setDraft({ ...draft, shellLength: v })} placeholder={selected.shellLength === '—' ? 'مثلاً ۱۹' : selected.shellLength} c={c} /></View><Field label="یادداشت اندازه‌گیری" value={draft.detail} onChangeText={(v) => setDraft({ ...draft, detail: v })} placeholder="مثلاً بعد از غذا" c={c} /><Pressable onPress={pickMeasurementPhoto} style={[styles.button, { backgroundColor: c.secondary, marginBottom: 12 }]}><Feather name="image" size={17} color={c.secondaryForeground} /><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>{measurementPhoto.uri ? 'تغییر عکس رشد' : 'افزودن عکس رشد (اختیاری)'}</Text></Pressable>{measurementPhoto.uri && <Image source={{ uri: measurementPhoto.uri }} style={styles.measurementPreview} />}<Button label={editingMeasurementId ? 'ذخیره تغییرات' : 'ثبت اندازه‌گیری'} icon="activity" onPress={addMeasurement} /></> : modal === 'reminder' ? <><Field label="عنوان" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="زمان غذا" c={c} /><Field label="ساعت" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="۱۰:۰۰" c={c} /><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 18 }]}>یادآوری روزانه روی همین دستگاه ذخیره و در نسخه اندروید زمان‌بندی می‌شود.</Text><Button label={editingReminderId ? 'ذخیره تغییرات' : 'ذخیره یادآوری'} icon="bell" onPress={addReminder} /></> : <><Field label="چه چیزی انجام شد؟" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="قاصدک / آب تازه" c={c} /><Field label="جزئیات" value={draft.detail} onChangeText={(v) => setDraft({ ...draft, detail: v })} placeholder="یک مشت کوچک · ۱۰:۱۵" c={c} /><Button label={editingLogId ? 'ذخیره تغییرات' : 'ذخیره فعالیت'} icon="check" onPress={() => addLog(draft.title === 'آب تازه شد' ? 'آب' : draft.title === 'نور خورشید / UV' ? 'نور' : 'غذا')} /></>}</KeyboardAwareScrollViewCompat></View></View></Modal>
     <Modal visible={!!deleteCandidate} transparent animationType="fade" onRequestClose={() => setDeleteCandidate(null)}><View style={styles.confirmBackdrop}><View style={[styles.confirmCard, { backgroundColor: c.card }]}><Text style={[styles.modalTitle, { color: c.foreground }]}>حذف لاک‌پشت</Text><Text style={[styles.guideText, { color: c.mutedForeground, marginBottom: 20 }]}>آیا مطمئن هستید که «{deleteCandidate?.name}» و فعالیت‌ها و یادآوری‌های مربوط به آن حذف شود؟</Text><View style={styles.two}><Pressable onPress={() => setDeleteCandidate(null)} style={[styles.button, { backgroundColor: c.secondary }]}><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>انصراف</Text></Pressable><Pressable onPress={confirmDeleteTurtle} style={[styles.button, { backgroundColor: '#C66A62' }]}><Text style={[styles.buttonText, { color: '#FFFFFF' }]}>حذف قطعی</Text></Pressable></View></View></View></Modal>
     <Modal visible={!!deleteRequest} transparent animationType="fade" onRequestClose={() => setDeleteRequest(null)}><View style={styles.confirmBackdrop}><View style={[styles.confirmCard, { backgroundColor: c.card }]}><View style={styles.rowBetween}><Text style={[styles.modalTitle, { color: c.foreground, marginBottom: 8 }]}>{deleteRequest?.title}</Text><Pressable onPress={() => setDeleteRequest(null)} hitSlop={10}><Feather name="x" size={20} color={c.mutedForeground} /></Pressable></View><Text style={[styles.guideText, { color: c.mutedForeground, marginBottom: 20 }]}>{deleteRequest?.message}</Text><View style={styles.two}><Pressable onPress={() => setDeleteRequest(null)} style={[styles.button, { backgroundColor: c.secondary }]}><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>انصراف</Text></Pressable><Pressable onPress={applyDeleteRequest} style={[styles.button, { backgroundColor: '#C66A62' }]}><Feather name="trash-2" size={15} color="#FFFFFF" /><Text style={[styles.buttonText, { color: '#FFFFFF' }]}>حذف قطعی</Text></Pressable></View></View></View></Modal>
       <Modal visible={examVisible} animationType="slide" transparent onRequestClose={() => { setExamVisible(false); setEditingExamId(null); }}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: c.card, paddingBottom: 0, maxHeight: '94%' }]}><KeyboardAwareScrollViewCompat contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }} showsVerticalScrollIndicator={false}><ExamModalContent key={editingExamId || 'new-exam'} initialExam={editingExamId ? store.exams.find((exam) => exam.id === editingExamId) : undefined} turtle={selected} c={c} step={examStep} setStep={setExamStep} onSave={saveExam} onClose={() => { setExamVisible(false); setEditingExamId(null); }} /></KeyboardAwareScrollViewCompat></View></View></Modal>
       <Modal visible={memoryVisible} animationType="slide" transparent onRequestClose={() => setMemoryVisible(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: c.card, maxHeight: '86%' }]}><KeyboardAwareScrollViewCompat contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }} showsVerticalScrollIndicator={false}><View style={styles.rowBetween}><Text style={[styles.modalTitle, { color: c.foreground }]}>{editingMemoryId ? 'ویرایش خاطره' : 'خاطره‌ی جدید'}</Text><Pressable onPress={() => setMemoryVisible(false)} hitSlop={10}><Feather name="x" size={22} color={c.mutedForeground} /></Pressable></View><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 14 }]}>یک لحظه‌ی ماندگار از {selected.name} را ثبت کنید.</Text><Field label="عنوان خاطره" value={memoryDraft.title} onChangeText={(value) => setMemoryDraft({ ...memoryDraft, title: value })} placeholder="اولین روز در خانه" c={c} /><Field label="توضیح" value={memoryDraft.description} onChangeText={(value) => setMemoryDraft({ ...memoryDraft, description: value })} placeholder="چه اتفاقی افتاد؟" c={c} /><Pressable onPress={pickMemoryPhoto} style={[styles.button, { backgroundColor: c.secondary, marginBottom: 12 }]}><Feather name="image" size={17} color={c.secondaryForeground} /><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>{memoryDraft.mediaUri ? 'تغییر تصویر خاطره' : 'افزودن تصویر (اختیاری)'}</Text></Pressable>{memoryDraft.mediaUri && <Image source={{ uri: memoryDraft.mediaUri }} style={styles.memoryPreview} />}<Button label={editingMemoryId ? 'ذخیره تغییرات' : 'ذخیره خاطره'} icon="check" onPress={saveMemory} /></KeyboardAwareScrollViewCompat></View></View></Modal>
     </View>;
}

function ExamModalContent({ turtle, c, step, setStep, onSave, onClose, initialExam }: { turtle: Turtle; c: typeof colors.light | typeof colors.dark; step: number; setStep: (step: number) => void; onSave: (sections: Record<string, ExamSection>, userNotes: string) => void; onClose: () => void; initialExam?: HealthExam }) {
  const steps = [{ key: 'eyes', label: 'چشم‌ها', icon: 'eye', prompt: 'از چشم‌ها در نور مناسب عکس بگیرید و موارد قابل مشاهده را ثبت کنید.' }, { key: 'nose', label: 'بینی', icon: 'wind', prompt: 'ترشح، تورم، تغییر رنگ یا زخم قابل مشاهده را بررسی کنید.' }, { key: 'mouth', label: 'دهان', icon: 'smile', prompt: 'در صورت امکان از دهان عکس مناسب بگیرید و فقط موارد قابل مشاهده را ثبت کنید.' }, { key: 'legs', label: 'پاها', icon: 'activity', prompt: 'پاها، ناخن‌ها، زخم، تورم یا آسیب قابل مشاهده را بررسی کنید.' }, { key: 'skin', label: 'پوست', icon: 'layers', prompt: 'پوست را از نظر زخم، تغییر رنگ، پوسته‌ریزی یا تورم بررسی کنید.' }, { key: 'shell', label: 'لاک', icon: 'shield', prompt: 'از نمای بالا یا جانبی عکس بگیرید و ترک، شکستگی یا تغییر واضح را بررسی کنید.' }, { key: 'generalCondition', label: 'وضعیت عمومی', icon: 'heart', prompt: 'چند سؤال کوتاه درباره‌ی وضعیت عمومی لاک‌پشت پاسخ دهید.' }] as const;
  const [sections, setSections] = useState<Record<string, ExamSection>>(() => initialExam ? { eyes: initialExam.eyes, nose: initialExam.nose, mouth: initialExam.mouth, legs: initialExam.legs, skin: initialExam.skin, shell: initialExam.shell, generalCondition: initialExam.generalCondition } : Object.fromEntries(steps.map((item) => [item.key, { status: 'normal', note: '' }])));
  const [userNotes, setUserNotes] = useState(initialExam?.userNotes || '');
  const current = steps[step];
  const update = (patch: Partial<ExamSection>) => setSections((value) => ({ ...value, [current.key]: { ...value[current.key], ...patch } }));
  const pick = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 }); if (!result.canceled && result.assets[0]?.uri) update({ imageUri: result.assets[0].uri }); };
  return <View style={{ flex: 1 }}><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.cardKicker, { color: c.primary }]}>معاینه {step + 1} از {steps.length}</Text><Text style={[styles.modalTitle, { color: c.foreground, marginBottom: 4 }]}>{current.label}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{turtle.name}</Text></View><Pressable onPress={onClose} hitSlop={10}><Feather name="x" size={22} color={c.mutedForeground} /></Pressable></View><View style={{ height: 6, backgroundColor: c.secondary, borderRadius: 4, marginVertical: 16 }}><View style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 6, borderRadius: 4, backgroundColor: c.primary }} /></View><Text style={[styles.guideText, { color: c.foreground, marginTop: 0 }]}>{current.prompt}</Text>{current.key === 'generalCondition' ? <><ExamQuestion label="اشتها طبیعی است؟" c={c} value={sections[current.key].note.includes('اشتها: خیر') ? 'no' : 'yes'} onChange={(value) => update({ note: `${value === 'no' ? 'اشتها: خیر' : 'اشتها: بله'}؛ ${sections[current.key].note.replace(/اشتها: (خیر|بله)؛? ?/, '')}` })} /><ExamQuestion label="فعالیت طبیعی است؟" c={c} value={sections[current.key].note.includes('فعالیت: خیر') ? 'no' : 'yes'} onChange={(value) => update({ note: `${sections[current.key].note.replace(/فعالیت: (خیر|بله)؛? ?/, '')}فعالیت: ${value === 'no' ? 'خیر' : 'بله'}؛ ` })} /><TextInput value={userNotes} onChangeText={setUserNotes} multiline placeholder="مورد دیگری وجود دارد؟" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, minHeight: 82, textAlignVertical: 'top', marginTop: 8 }]} /></> : <><Pressable onPress={pick} style={[styles.button, { backgroundColor: c.secondary, marginTop: 16 }]}><Feather name="image" size={17} color={c.secondaryForeground} /><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>{sections[current.key].imageUri ? 'تغییر تصویر' : 'افزودن تصویر از گالری'}</Text></Pressable>{sections[current.key].imageUri && <Image source={{ uri: sections[current.key].imageUri }} style={{ width: '100%', height: 145, borderRadius: 16, marginTop: 12 }} />}</>}<TextInput value={sections[current.key].note} onChangeText={(value) => update({ note: value })} multiline placeholder="یادداشت یا نتیجه‌ی قابل مشاهده..." placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, minHeight: 82, textAlignVertical: 'top', marginTop: 14 }]} /><View style={styles.quickGrid}><ExamStatus label="طبیعی" value="normal" selected={sections[current.key].status} c={c} onPress={() => update({ status: 'normal' })} /><ExamStatus label="نیازمند پیگیری" value="attention" selected={sections[current.key].status} c={c} onPress={() => update({ status: 'attention' })} /><ExamStatus label="نگران‌کننده" value="warning" selected={sections[current.key].status} c={c} onPress={() => update({ status: 'warning' })} /></View><View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>{step > 0 && <Pressable onPress={() => setStep(step - 1)} style={[styles.button, { backgroundColor: c.secondary }]}><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>قبلی</Text></Pressable>}<Pressable onPress={() => step < steps.length - 1 ? setStep(step + 1) : onSave(sections, userNotes)} style={[styles.button, { backgroundColor: c.primary }]}><Text style={[styles.buttonText, { color: c.primaryForeground }]}>{step < steps.length - 1 ? 'مرحله بعد' : 'ذخیره معاینه'}</Text><Feather name={step < steps.length - 1 ? 'arrow-left' : 'check'} size={16} color={c.primaryForeground} /></Pressable></View></View>;
}

function ExamStatus({ label, value, selected, c, onPress }: { label: string; value: ExamSection['status']; selected: ExamSection['status']; c: typeof colors.light | typeof colors.dark; onPress: () => void }) { return <Pressable onPress={onPress} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: selected === value ? c.primary : c.border, backgroundColor: selected === value ? c.secondary : c.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: selected === value ? c.primary : c.mutedForeground, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable>; }
function ExamQuestion({ label, value, onChange, c }: { label: string; value: 'yes' | 'no'; onChange: (value: 'yes' | 'no') => void; c: typeof colors.light | typeof colors.dark }) { return <View style={[styles.rowBetween, { marginTop: 14 }]}><Text style={[styles.careLabel, { color: c.foreground }]}>{label}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => onChange('yes')} style={[styles.turtleChip, { backgroundColor: value === 'yes' ? c.secondary : c.card, borderColor: value === 'yes' ? c.primary : c.border }]}><Text style={{ color: c.primary, fontWeight: '700' }}>بله</Text></Pressable><Pressable onPress={() => onChange('no')} style={[styles.turtleChip, { backgroundColor: value === 'no' ? c.secondary : c.card, borderColor: value === 'no' ? c.primary : c.border }]}><Text style={{ color: c.primary, fontWeight: '700' }}>خیر</Text></Pressable></View></View>; }

function VisualStats({ store, selected, setSelected, c, onEditMeasurement, onDeleteMeasurement }: { store: Store; selected: Turtle; setSelected: (turtle: Turtle) => void; c: typeof colors.light | typeof colors.dark; onEditMeasurement: (record: MeasurementRecord) => void; onDeleteMeasurement: (record: MeasurementRecord) => void }) {
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const weights = (selected.weightHistory || []).filter((record) => record.weight !== '—').map((record) => ({ ...record, value: Number(record.weight) })).filter((record) => Number.isFinite(record.value));
  const measurements = (selected.measurementHistory || []).filter((record) => record.length !== '—').map((record) => ({ ...record, value: Number(record.length) })).filter((record) => Number.isFinite(record.value));
  const growthPhotos = (selected.measurementHistory || []).filter((record) => record.photo).map((record) => ({ id: record.id, date: record.date, photo: record.photo as string, length: record.length }));
  const before = growthPhotos.find((record) => record.id === beforeId);
  const after = growthPhotos.find((record) => record.id === afterId);
  const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
  const visibleWeights = weights.filter((record) => !cutoff || new Date(record.date).getTime() >= cutoff);
  const visibleMeasurements = measurements.filter((record) => !cutoff || new Date(record.date).getTime() >= cutoff);
  const latestWeight = weights[weights.length - 1]?.value;
  const previousWeight = weights.length > 1 ? weights[weights.length - 2]?.value : undefined;
  const weightDelta = latestWeight !== undefined && previousWeight !== undefined ? latestWeight - previousWeight : undefined;
  const foodLogs = store.logs.filter((log) => log.turtle === selected.name && log.type === 'غذا');
  const foodVariety = new Set(foodLogs.map((log) => log.title.trim()).filter(Boolean)).size;
  const completed = store.care.filter((item) => item.done).length;
  const carePercent = store.care.length ? Math.round((completed / store.care.length) * 100) : 0;
  const chart = (records: { value: number }[], color: string, unit: string) => {
    if (!records.length) return <Text style={[styles.careTime, { color: c.mutedForeground }]}>هنوز سابقه‌ای برای این بازه ثبت نشده است.</Text>;
    const max = Math.max(...records.map((record) => record.value));
    const min = Math.min(...records.map((record) => record.value));
    const spread = max - min || 1;
    return <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 12 }}>{records.slice(-8).map((record, index) => <View key={`${record.value}-${index}`} style={{ flex: 1, height: 100, justifyContent: 'flex-end', alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 28, height: 24 + ((record.value - min) / spread) * 64, borderRadius: 8, backgroundColor: color }} /><Text style={[styles.barLabel, { color: c.mutedForeground, marginTop: 5 }]}>{record.value}{unit}</Text></View>)}</View>;
  };
  return <ScrollView contentContainerStyle={styles.scroll}><HeaderForStats title="گزارش سلامت و رشد" sub={`نمای کلی وضعیت ${selected.name}`} c={c} /><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)} style={[styles.turtleChip, { backgroundColor: selected.id === turtle.id ? c.primary : c.secondary, borderColor: selected.id === turtle.id ? c.primary : c.border }]}><Feather name="heart" size={14} color={selected.id === turtle.id ? '#FFFFFF' : c.primary} /><Text style={{ color: selected.id === turtle.id ? '#FFFFFF' : c.foreground, fontWeight: '700', fontSize: 13 }}>{turtle.name}</Text></Pressable>)}</ScrollView>
    <CardForStats c={c}><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.cardKicker, { color: c.primary }]}>خلاصه وضعیت</Text><Text style={[styles.turtleName, { color: c.foreground, marginTop: 7 }]}>{latestWeight ? `${latestWeight} گرم` : 'وزن ثبت نشده'}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{weightDelta === undefined ? 'برای دیدن روند، اندازه‌گیری بیشتری ثبت کنید.' : `${weightDelta >= 0 ? '↗' : '↘'} ${Math.abs(weightDelta)} گرم نسبت به ثبت قبلی`}</Text></View><View style={{ width: 74, height: 74, borderRadius: 40, borderWidth: 8, borderColor: c.secondary, borderTopColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.careLabel, { color: c.primary }]}>{carePercent}٪</Text></View></View></CardForStats>
    <View style={styles.statGrid}><CardForStats c={c} style={styles.statCard}><Feather name="activity" size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{weights.length}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>ثبت وزن</Text></CardForStats><CardForStats c={c} style={styles.statCard}><Feather name="coffee" size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{foodVariety}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>تنوع غذا</Text></CardForStats><CardForStats c={c} style={styles.statCard}><Feather name="check-circle" size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{carePercent}٪</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>مراقبت انجام‌شده</Text></CardForStats><CardForStats c={c} style={styles.statCard}><Feather name="clock" size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{store.logs.filter((log) => log.turtle === selected.name).length}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>فعالیت ثبت‌شده</Text></CardForStats></View>
     <Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}>روند وزن</Text><CardForStats c={c}>{chart(visibleWeights, c.primary, 'g')}</CardForStats><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}>روند اندازه لاک</Text><CardForStats c={c}>{chart(visibleMeasurements, c.accent, 'cm')}</CardForStats>
     <Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}>روند رشد</Text><CardForStats c={c}><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>ثبت‌های واقعی وزن، اندازه و عکس را در کنار هم ببینید.</Text>{visibleMeasurements.length ? visibleMeasurements.slice().reverse().slice(0, 8).map((record) => <View key={record.id} style={styles.timelineRow}><View style={[styles.timelineDot, { backgroundColor: c.primary }]} /><View style={styles.flex}><Text style={[styles.careLabel, { color: c.foreground }]}>طول لاک: {record.value} سانتی‌متر</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{new Date(record.date).toLocaleDateString('fa-IR')}{record.photo ? ' · عکس رشد ثبت شده' : ''}</Text></View>{record.photo && <Image source={{ uri: record.photo }} style={styles.timelinePhoto} />}<Pressable onPress={() => onEditMeasurement(record)} hitSlop={10} style={{ marginLeft: 10 }}><Feather name="edit-2" size={16} color={c.primary} /></Pressable><Pressable onPress={() => onDeleteMeasurement(record)} hitSlop={10} style={{ marginLeft: 10 }}><Feather name="trash-2" size={16} color="#C66A62" /></Pressable></View>) : <Text style={[styles.careTime, { color: c.mutedForeground }]}>برای ساخت روند رشد، یک اندازه‌گیری جدید ثبت کنید.</Text>}</CardForStats>
     <Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 8 }]}>مقایسه‌ی عکس قبل و بعد</Text><CardForStats c={c}><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 12 }]}>دو عکس رشد را انتخاب کنید تا تغییرات را کنار هم ببینید.</Text>{growthPhotos.length < 2 ? <Text style={[styles.careTime, { color: c.mutedForeground }]}>حداقل دو اندازه‌گیری همراه با عکس لازم است.</Text> : <>{growthPhotos.slice().reverse().map((record) => <Pressable key={record.id} onPress={() => !beforeId ? setBeforeId(record.id) : !afterId && record.id !== beforeId ? setAfterId(record.id) : (setBeforeId(record.id), setAfterId(null))} style={[styles.photoChoice, { borderColor: beforeId === record.id || afterId === record.id ? c.primary : c.border, backgroundColor: beforeId === record.id || afterId === record.id ? c.secondary : c.card }]}><Image source={{ uri: record.photo }} style={styles.choicePhoto} /><View style={styles.flex}><Text style={[styles.careLabel, { color: c.foreground }]}>{beforeId === record.id ? 'قبل' : afterId === record.id ? 'بعد' : 'انتخاب عکس'}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{new Date(record.date).toLocaleDateString('fa-IR')} · {record.length} سانتی‌متر</Text></View></Pressable>)}{before && after && <View style={styles.compareRow}><View style={styles.compareItem}><Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>قبل</Text><Image source={{ uri: before.photo }} style={styles.comparePhoto} /></View><Feather name="arrow-left" size={20} color={c.primary} /><View style={styles.compareItem}><Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>بعد</Text><Image source={{ uri: after.photo }} style={styles.comparePhoto} /></View></View>}<Pressable onPress={() => { setBeforeId(null); setAfterId(null); }} style={{ alignSelf: 'flex-start', marginTop: 10 }}><Text style={[styles.link, { color: c.primary }]}>پاک کردن انتخاب‌ها</Text></Pressable></>}</CardForStats>
    <View style={styles.quickGrid}>{(['7', '30', '90', 'all'] as const).map((item) => <Pressable key={item} onPress={() => setRange(item)} style={[styles.button, { backgroundColor: range === item ? c.primary : c.secondary }]}><Text style={[styles.buttonText, { color: range === item ? c.primaryForeground : c.secondaryForeground }]}>{item === 'all' ? 'همه' : `${item} روز`}</Text></Pressable>)}</View>
    <Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 12 }]}>خلاصه این دوره</Text><CardForStats c={c}><Text style={[styles.guideText, { color: c.foreground }]}>{visibleWeights.length > 1 && weightDelta !== undefined ? `در بازه انتخاب‌شده ${weightDelta >= 0 ? 'روند وزن افزایشی' : 'روند وزن کاهشی'} بوده است. ` : 'در این بازه سابقه‌ی کافی برای تحلیل وزن وجود ندارد. '}{foodLogs.length ? `${foodLogs.length} بار غذا و ${foodVariety} نوع غذای متفاوت ثبت شده است.` : 'هنوز فعالیت غذایی ثبت نشده است.'}</Text></CardForStats>
  </ScrollView>;
}

function HeaderForStats({ title, sub, c }: { title: string; sub?: string; c: typeof colors.light | typeof colors.dark }) { return <View style={[styles.header, { paddingTop: 8 }]}><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: c.primary }]}>لاک‌پشت‌یار</Text><Text style={[styles.h1, { color: c.foreground }]}>{title}</Text>{sub && <Text style={[styles.sub, { color: c.mutedForeground }]}>{sub}</Text>}</View><View style={[styles.avatar, { backgroundColor: c.accent }]}><Feather name="bar-chart-2" size={20} color={c.accentForeground} /></View></View>; }
function CardForStats({ children, c, style }: { children: React.ReactNode; c: typeof colors.light | typeof colors.dark; style?: object }) { return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>; }

function Field({ label, value, onChangeText, placeholder, c }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; c: typeof colors.light | typeof colors.dark }) { return <View style={styles.field}><Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} /></View>; }

const styles: any = StyleSheet.create({
  turtleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, marginRight: 8 }, filterChip: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,.45)' },
  confirmCard: { width: '100%', maxWidth: 390, borderRadius: 22, padding: 22 },
  container: { flex: 1 }, flex: { flex: 1 }, scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { paddingBottom: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerCopy: { flex: 1 }, backButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }, h1: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8, marginTop: 5 }, sub: { fontSize: 14, marginTop: 4 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 }, progressCard: { padding: 20 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, progressTitle: { fontSize: 20, fontWeight: '600', marginTop: 8 }, percent: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' }, progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,.22)', borderRadius: 8, marginTop: 20, overflow: 'hidden' }, progressFill: { height: 8, backgroundColor: '#F2C76E', borderRadius: 8 }, progressHint: { color: '#D9EDDB', fontSize: 12, marginTop: 10 }, miniStats: { flexDirection: 'row', gap: 18, marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E6EFE5' }, miniStat: { fontSize: 15, fontWeight: '700' }, guideButton: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, guideText: { fontSize: 15, lineHeight: 25, marginTop: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 }, sectionTitle: { fontSize: 19, fontWeight: '700' }, link: { fontWeight: '600', fontSize: 13 }, muted: { fontSize: 13 }, search: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, marginBottom: 4, fontSize: 14 }, careRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, careIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, careLabel: { fontSize: 15, fontWeight: '600' }, careTime: { fontSize: 12, marginTop: 3 }, strike: { textDecorationLine: 'line-through', opacity: .6 }, check: { width: 23, height: 23, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 }, button: { minHeight: 46, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, flex: 1 }, buttonText: { fontSize: 14, fontWeight: '700' }, logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, dot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 }, logTitle: { fontSize: 15, fontWeight: '600' }, turtleCard: { flexDirection: 'row', alignItems: 'center', gap: 13 }, turtlePhoto: { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%' }, turtleName: { fontSize: 18, fontWeight: '700' }, meta: { fontSize: 12, marginTop: 8 }, month: { fontSize: 18, fontWeight: '700', marginBottom: 18 }, week: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }, day: { color: '#8B9D8D', fontSize: 12, fontWeight: '700' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, date: { width: '14.28%', height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginBottom: 3 }, dateDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 }, reminderRow: { flexDirection: 'row', alignItems: 'center' }, switch: { width: 42, height: 25, borderRadius: 14, padding: 3 }, switchKnob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFFFFF' }, bigNumber: { fontSize: 48, fontWeight: '700', marginTop: 5 }, bigUnit: { fontSize: 24, fontWeight: '500' }, bars: { height: 125, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', marginTop: 12 }, barCol: { height: 125, alignItems: 'center', justifyContent: 'flex-end', gap: 7 }, bar: { width: 20, borderRadius: 7 }, barLabel: { fontSize: 11 }, statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, statCard: { width: '48%', minHeight: 110, marginBottom: 0 }, statValue: { fontSize: 22, fontWeight: '700', marginTop: 12 }, weightLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 90 }, weightPoint: { alignItems: 'center', gap: 5 }, point: { width: 13, height: 13, borderRadius: 7 }, settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, privacy: { textAlign: 'center', lineHeight: 20, fontSize: 12, paddingHorizontal: 20, marginTop: 24 }, nav: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 }, navItem: { alignItems: 'center', gap: 4, minWidth: 48 }, navText: { fontSize: 10, fontWeight: '600' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.4)' }, modal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 }, modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 22 }, field: { marginBottom: 14, flex: 1 }, fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 13, fontSize: 15 }, two: { flexDirection: 'row', gap: 10 },
  measurementPreview: { width: '100%', height: 150, borderRadius: 16, marginBottom: 12 }, memoryPreview: { width: '100%', height: 190, borderRadius: 16, marginBottom: 12 }, timelineRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingVertical: 8 }, timelineDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 }, timelinePhoto: { width: 48, height: 48, borderRadius: 12 }, photoChoice: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 8, marginBottom: 8 }, choicePhoto: { width: 54, height: 54, borderRadius: 10, marginRight: 10 }, compareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, compareItem: { alignItems: 'center', flex: 1 }, comparePhoto: { width: 125, height: 125, borderRadius: 16, marginTop: 6 }, itemActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 10, marginTop: 14 }, actionButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }, actionText: { fontSize: 12, fontWeight: '700' }, statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, examGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, examItem: { width: '30%', backgroundColor: '#F4F7F0', borderRadius: 10, padding: 8 }, examStatus: { fontSize: 11, fontWeight: '700' },
});
