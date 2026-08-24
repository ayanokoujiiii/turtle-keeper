import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

type Turtle = { id: string; name: string; species: string; gender: string; weight: string; shellLength: string; notes: string; photo?: string };
type Care = { id: string; label: string; icon: keyof typeof Feather.glyphMap; done: boolean; time?: string };
type Reminder = { id: string; title: string; turtle: string; time: string; repeat: string; active: boolean };
type Log = { id: string; type: string; title: string; turtle: string; detail: string; date: string };
type Store = { turtles: Turtle[]; care: Care[]; reminders: Reminder[]; logs: Log[] };

const initialStore: Store = {
  turtles: [{ id: 'first-turtle', name: 'لاک‌پشت من', species: 'لاک‌پشت ایرانی', gender: 'نامشخص', weight: '850', shellLength: '19', notes: 'به برگ قاصدک علاقه دارد.' }],
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
};

const key = 'turtle-keeper-store-v2';
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  const [tab, setTab] = useState<'home' | 'turtles' | 'calendar' | 'reminders' | 'stats' | 'settings' | 'guide'>('home');
  const [modal, setModal] = useState<'turtle' | 'log' | 'measurement' | 'reminder' | null>(null);
  const [selected, setSelected] = useState<Turtle>(initialStore.turtles[0]);
  const [deleteCandidate, setDeleteCandidate] = useState<Turtle | null>(null);
  const [editingTurtleId, setEditingTurtleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({ name: '', species: '', weight: '', shellLength: '', notes: '', title: '', detail: '', time: '10:00' });
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-flash-lite-latest');
  const [guideText, setGuideText] = useState('');
  const [foodWarning, setFoodWarning] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);

  useEffect(() => { AsyncStorage.getItem(key).then((raw) => raw && setStore(JSON.parse(raw))); }, []);
  useEffect(() => {
    AsyncStorage.multiGet(['turtle-keeper-gemini-key', 'turtle-keeper-gemini-model']).then(([keyEntry, modelEntry]) => {
      if (keyEntry[1]) setGeminiKey(keyEntry[1]);
      if (modelEntry[1]) setGeminiModel(modelEntry[1]);
    });
  }, []);
  useEffect(() => { AsyncStorage.setItem(key, JSON.stringify(store)); }, [store]);
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
  const filteredLogs = store.logs.filter((x) => `${x.title} ${x.detail} ${x.turtle} ${x.type}`.toLowerCase().includes(search.toLowerCase()));
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
    const turtle = { id: editingTurtleId || uid(), name: draft.name.trim(), species: draft.species || 'لاک‌پشت', gender: editingTurtleId ? selected.gender : 'نامشخص', weight: draft.weight || '—', shellLength: draft.shellLength || '—', notes: draft.notes };
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
  const openLog = (kind: string) => {
    setDraft((d) => ({ ...d, title: kind === 'غذا' ? '' : kind === 'آب' ? 'آب تازه شد' : 'نور خورشید / UV', detail: '' }));
    setModal('log');
  };
  const addLog = (type: string) => {
    if (!draft.title.trim()) return Alert.alert('عنوان را وارد کنید', 'بنویسید چه چیزی را ثبت می‌کنید.');
    setStore((s) => ({ ...s, logs: [{ id: uid(), type, title: draft.title, turtle: selected.name, detail: draft.detail || 'همین حالا ثبت شد', date: 'امروز' }, ...s.logs] }));
    setDraft((d) => ({ ...d, title: '', detail: '' })); setModal(null);
  };
  const addMeasurement = () => {
    if (!draft.weight.trim() && !draft.shellLength.trim()) return Alert.alert('اندازه یا وزن لازم است', 'حداقل یکی از دو مقدار وزن یا طول لاک را وارد کنید.');
    const weight = draft.weight.trim() || selected.weight;
    const shellLength = draft.shellLength.trim() || selected.shellLength;
    setStore((s) => ({ ...s, turtles: s.turtles.map((turtle) => turtle.id === selected.id ? { ...turtle, weight, shellLength } : turtle), logs: [{ id: uid(), type: 'اندازه‌گیری', title: `وزن ${weight} گرم · طول لاک ${shellLength} سانتی‌متر`, turtle: selected.name, detail: draft.detail || 'اندازه‌گیری جدید', date: 'امروز' }, ...s.logs] }));
    setSelected((turtle) => ({ ...turtle, weight, shellLength })); setModal(null); resetDraft();
  };
  const addReminder = () => {
    if (!draft.title.trim()) return;
    setStore((s) => ({ ...s, reminders: [...s.reminders, { id: uid(), title: draft.title, turtle: selected.name, time: draft.time, repeat: 'هر روز', active: true }] }));
    setDraft((d) => ({ ...d, title: '', time: '10:00' })); setModal(null);
  };
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      const photo = result.assets[0]?.uri;
      if (photo) { setStore((s) => ({ ...s, turtles: s.turtles.map((t) => t.id === selected.id ? { ...t, photo } : t) })); setSelected((t) => ({ ...t, photo })); }
    }
  };
  const exportData = async () => { await AsyncStorage.setItem('turtle-keeper-last-export', JSON.stringify(store)); Alert.alert('پشتیبان آماده است', 'اطلاعات شما به‌صورت محلی و قابل انتقال ذخیره شد.'); };
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
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel.trim() || 'gemini-flash-lite-latest')}:generateContent?key=${encodeURIComponent(geminiKey.trim())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] },) });
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!response.ok) throw new Error(data?.error?.message || 'خطا در اتصال');
      setGuideText(text || 'پاسخی از Gemini دریافت نشد.');
      if (text?.includes('هشدار غذایی')) setFoodWarning(text);
    } catch {
      Alert.alert('اتصال برقرار نشد', 'کلید یا اتصال اینترنت را بررسی کنید. اطلاعات شما همچنان روی دستگاه باقی می‌ماند.');
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
    <View style={styles.quickGrid}><Button label="ثبت وزن و اندازه" icon="activity" onPress={() => { resetDraft(); setModal('measurement'); }} secondary /></View>
    <Card><View style={styles.rowBetween}><View><Text style={[styles.cardKicker, { color: c.primary }]}>یادآوری بعدی</Text><Text style={[styles.logTitle, { color: c.foreground, marginTop: 6 }]}>{store.reminders.find((r) => r.active)?.title || 'یادآوری جدید بسازید'}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{store.reminders.find((r) => r.active) ? `امروز ساعت ${store.reminders.find((r) => r.active)?.time}` : 'برای نظم بیشتر یک یادآوری اضافه کنید'}</Text></View><Pressable onPress={() => setTab('reminders')}><Feather name="arrow-left" size={20} color={c.primary} /></Pressable></View></Card>
    <Card style={{ backgroundColor: '#EEF5E8' }}><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.cardKicker, { color: c.primary }]}>راهنمای امروز</Text><Text style={[styles.logTitle, { color: c.foreground, marginTop: 6 }]}>نکات اختصاصی برای نگهداری بهتر</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>غذاهای امروز را هم بررسی می‌کنم.</Text></View><Pressable onPress={() => { setTab('guide'); askGuide(); }} style={[styles.guideButton, { backgroundColor: c.primary }]}><Feather name="book-open" size={19} color="#FFFFFF" /></Pressable></View></Card>
    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: c.foreground }]}>فعالیت‌های اخیر</Text><Text style={[styles.muted, { color: c.mutedForeground }]}>{store.logs.length} مورد</Text></View>
    <TextInput value={search} onChangeText={setSearch} placeholder="جست‌وجو در فعالیت‌ها..." placeholderTextColor={c.mutedForeground} style={[styles.search, { color: c.foreground, borderColor: c.border, backgroundColor: c.card }]} />
    <Card>{filteredLogs.filter((log) => log.turtle === selected.name).slice(0, 3).map((log) => <View key={log.id} style={styles.logRow}><View style={[styles.dot, { backgroundColor: log.type === 'غذا' ? '#E8B85E' : '#82BBD0' }]} /><View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{log.title}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{log.type} · {log.turtle} · {log.detail}</Text></View><Text style={[styles.careTime, { color: c.mutedForeground }]}>{log.date}</Text></View>)}</Card>
  </ScrollView>;

   const Turtles = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="لاک‌پشت‌های من" sub={`${store.turtles.length} همراه دوست‌داشتنی`} /><Button label="افزودن لاک‌پشت" icon="plus" onPress={() => openTurtleEditor()} /><View style={{ height: 14 }} />{store.turtles.map((t) => <Pressable key={t.id} onPress={() => setSelected(t)}><Card style={[styles.turtleCard, selected.id === t.id && { borderColor: c.primary, borderWidth: 2 }]}><View style={[styles.turtlePhoto, { backgroundColor: c.secondary }]}>{t.photo ? <Image source={{ uri: t.photo }} style={styles.image} /> : <Feather name="heart" size={28} color={c.primary} />}</View><View style={styles.flex}><Text style={[styles.turtleName, { color: c.foreground }]}>{t.name}</Text><Text style={[styles.sub, { color: c.mutedForeground }]}>{t.species}</Text><Text style={[styles.meta, { color: c.mutedForeground }]}>{t.weight} گرم  ·  طول لاک {t.shellLength} سانتی‌متر</Text></View><Pressable onPress={() => openTurtleEditor(t)} hitSlop={10}><Feather name="edit-2" size={18} color={c.primary} /></Pressable><Pressable onPress={() => deleteTurtle(t)} hitSlop={10}><Feather name="trash-2" size={18} color="#C66A62" /></Pressable></Card></Pressable>)}</ScrollView>;
  const Calendar = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="تقویم مراقبت" sub="روتین روزانه‌تان را دنبال کنید" /><Card><Text style={[styles.month, { color: c.foreground }]}>مرداد ۱۴۰۵</Text><View style={styles.week}><Text style={styles.day}>ش</Text><Text style={styles.day}>ی</Text><Text style={styles.day}>د</Text><Text style={styles.day}>س</Text><Text style={styles.day}>چ</Text><Text style={styles.day}>پ</Text><Text style={styles.day}>ج</Text></View><View style={styles.calendarGrid}>{Array.from({ length: 31 }, (_, i) => <View key={i} style={[styles.date, i + 1 === 23 && { backgroundColor: c.primary }]}><Text style={{ color: i + 1 === 23 ? '#fff' : c.foreground }}>{i + 1}</Text>{[2, 7, 11, 15, 18, 22].includes(i + 1) && <View style={[styles.dateDot, { backgroundColor: c.accent }]} />}</View>)}</View></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>امروز، ۲۳ مرداد</Text><Card>{store.care.map((item) => <View key={item.id} style={styles.logRow}><Feather name={item.done ? 'check-circle' : 'circle'} size={20} color={item.done ? c.primary : c.mutedForeground} /><Text style={[styles.careLabel, { color: c.foreground, marginLeft: 12 }]}>{item.label}</Text></View>)}</Card></ScrollView>;
  const Reminders = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="یادآوری‌ها" sub="مراقبت را ساده و منظم نگه دارید" /><Button label="یادآوری جدید" icon="plus" onPress={() => setModal('reminder')} /><View style={{ height: 14 }} />{store.reminders.map((r) => <Card key={r.id} style={styles.reminderRow}><View style={[styles.careIcon, { backgroundColor: c.secondary }]}><Feather name="bell" size={18} color={c.primary} /></View><View style={styles.flex}><Text style={[styles.logTitle, { color: c.foreground }]}>{r.title}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{r.turtle} · {r.repeat}، ساعت {r.time}</Text></View><Pressable onPress={() => setStore((s) => ({ ...s, reminders: s.reminders.map((x) => x.id === r.id ? { ...x, active: !x.active } : x) }))}><View style={[styles.switch, { backgroundColor: r.active ? c.primary : c.border }]}><View style={[styles.switchKnob, { alignSelf: r.active ? 'flex-end' : 'flex-start' }]} /></View></Pressable></Card>)}</ScrollView>;
   const Stats = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="گزارش‌ها" sub={`روند و وضعیت همه‌ی ${store.turtles.length} لاک‌پشت`} /><Text style={[styles.sectionTitle, { color: c.foreground, marginBottom: 10 }]}>تمرکز گزارش</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)} style={[styles.turtleChip, { backgroundColor: selected.id === turtle.id ? c.primary : c.secondary, borderColor: selected.id === turtle.id ? c.primary : c.border }]}><Feather name="heart" size={14} color={selected.id === turtle.id ? '#FFFFFF' : c.primary} /><Text style={{ color: selected.id === turtle.id ? '#FFFFFF' : c.foreground, fontWeight: '700', fontSize: 13 }}>{turtle.name}</Text></Pressable>)}</ScrollView><Card><Text style={[styles.cardKicker, { color: c.primary }]}>وضعیت {selected.name}</Text><Text style={[styles.bigNumber, { color: c.foreground }]}>{selected.weight}<Text style={styles.bigUnit}> گرم</Text></Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>طول لاک: {selected.shellLength} سانتی‌متر · {store.logs.filter((log) => log.turtle === selected.name).length} فعالیت ثبت‌شده</Text></Card><View style={styles.statGrid}>{[['آخرین وزن', `${selected.weight} گرم`, 'activity'], ['فعالیت‌ها', `${store.logs.filter((log) => log.turtle === selected.name).length}`, 'check-circle'], ['یادآوری‌ها', `${store.reminders.filter((reminder) => reminder.turtle === selected.name && reminder.active).length}`, 'bell'], ['یادداشت', selected.notes ? 'دارد' : 'ندارد', 'edit-3']].map(([label, value, icon]) => <Card key={label} style={styles.statCard}><Feather name={icon as keyof typeof Feather.glyphMap} size={18} color={c.primary} /><Text style={[styles.statValue, { color: c.foreground }]}>{value}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{label}</Text></Card>)}</View><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>خلاصه‌ی همه‌ی لاک‌پشت‌ها</Text>{store.turtles.map((turtle) => <Pressable key={turtle.id} onPress={() => setSelected(turtle)}><Card><View style={styles.rowBetween}><View style={styles.flex}><Text style={[styles.turtleName, { color: c.foreground }]}>{turtle.name}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{turtle.species} · وزن {turtle.weight} گرم · طول لاک {turtle.shellLength} سانتی‌متر</Text></View><Feather name={selected.id === turtle.id ? 'check-circle' : 'chevron-left'} size={20} color={selected.id === turtle.id ? c.primary : c.mutedForeground} /></View></Card></Pressable>)}</ScrollView>;
   const Settings = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="تنظیمات" sub="خصوصی، آفلاین و متعلق به شما" /><Card>{[['bell', 'اعلان‌ها', 'یادآوری‌ها روی همین دستگاه'], ['sun', 'ظاهر برنامه', 'هماهنگ با دستگاه'], ['sliders', 'واحدها', 'متریک (گرم، سانتی‌متر)'], ['globe', 'زبان', 'فارسی']].map(([icon, label, value]) => <View key={label} style={styles.settingRow}><View style={[styles.careIcon, { backgroundColor: c.secondary }]}><Feather name={icon as keyof typeof Feather.glyphMap} size={17} color={c.primary} /></View><View style={styles.flex}><Text style={[styles.careLabel, { color: c.foreground }]}>{label}</Text><Text style={[styles.careTime, { color: c.mutedForeground }]}>{value}</Text></View><Feather name="chevron-left" size={18} color={c.mutedForeground} /></View>)}</Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اعلان‌ها</Text><Card><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>یادآوری‌های فعال هر روز روی همین دستگاه زمان‌بندی می‌شوند. برای اطمینان، اعلان آزمایشی را بفرستید.</Text><Button label="ارسال اعلان آزمایشی" icon="bell" onPress={testNotification} secondary /></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اتصال راهنمای هوشمند</Text><Card><Text style={[styles.careLabel, { color: c.foreground }]}>کلید Google Gemini</Text><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 10 }]}>کلید فقط روی همین دستگاه ذخیره می‌شود و در پشتیبان JSON قرار نمی‌گیرد.</Text><TextInput value={geminiKey} onChangeText={setGeminiKey} secureTextEntry placeholder="کلید Gemini را وارد کنید" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, marginBottom: 12 }]} /><Text style={[styles.careLabel, { color: c.foreground }]}>مدل Gemini</Text><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 8 }]}>نام مدل را دقیق وارد کنید؛ مثلاً gemini-2.5-flash یا gemini-2.5-pro.</Text><TextInput value={geminiModel} onChangeText={setGeminiModel} autoCapitalize="none" placeholder="gemini-2.5-flash" placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background, marginBottom: 10 }]} /><Button label="ذخیره کلید و مدل" icon="lock" onPress={saveGeminiKey} secondary /><View style={{ height: 10 }} /><Button label="باز کردن راهنما" icon="book-open" onPress={() => setTab('guide')} secondary /></Card><Text style={[styles.sectionTitle, { color: c.foreground, marginTop: 22 }]}>اطلاعات شما</Text><Card><Button label="خروجی پشتیبان JSON" icon="download" onPress={exportData} secondary /><View style={{ height: 10 }} /><Button label="ورود پشتیبان" icon="upload" onPress={() => Alert.alert('ورود پشتیبان', 'انتخاب فایل turtle_keeper_backup.json در نسخه بعدی اضافه می‌شود.')} secondary /></Card><Text style={[styles.privacy, { color: c.mutedForeground }]}>اطلاعات شما فقط روی دستگاه ذخیره می‌شود. بدون حساب کاربری، فضای ابری، تبلیغات و تحلیل اجباری.</Text></ScrollView>;
  const Guide = () => <ScrollView contentContainerStyle={styles.scroll}><Header title="راهنمای هوشمند" sub="نکات شخصی‌سازی‌شده برای لاک‌پشت‌ها" /><Card style={{ backgroundColor: c.primary }}><Text style={[styles.cardKicker, { color: '#D9EDDB' }]}>راهنمای روزانه</Text><Text style={[styles.progressTitle, { color: '#FFFFFF' }]}>مراقبت بهتر، با اطلاعات بیشتر</Text><Text style={[styles.progressHint, { marginTop: 8 }]}>Gemini با توجه به فعالیت‌های ثبت‌شده، یک پیشنهاد کوتاه و احتیاطی آماده می‌کند.</Text><View style={{ marginTop: 16 }}><Button label={guideLoading ? 'در حال دریافت...' : 'دریافت نکته جدید'} icon="refresh-cw" onPress={askGuide} secondary /></View></Card>{foodWarning && <Card style={{ backgroundColor: '#FFF4DC', borderColor: '#E8C873' }}><Text style={[styles.cardKicker, { color: '#8B6515' }]}>هشدار غذایی</Text><Text style={[styles.guideText, { color: '#5F4613' }]}>{foodWarning}</Text></Card>}<Card><Text style={[styles.sectionTitle, { color: c.foreground, fontSize: 17 }]}>پاسخ راهنما</Text>{guideLoading ? <ActivityIndicator color={c.primary} style={{ margin: 28 }} /> : <Text style={[styles.guideText, { color: c.foreground }]}>{guideText || 'برای دریافت پیشنهاد، کلید Gemini را در تنظیمات ذخیره کنید و روی «دریافت نکته جدید» بزنید.'}</Text>}</Card><Card><Text style={[styles.cardKicker, { color: c.primary }]}>غذاهای امروز</Text>{store.logs.filter((log) => log.date === 'امروز' && log.type === 'غذا').length ? store.logs.filter((log) => log.date === 'امروز' && log.type === 'غذا').map((log) => <View key={log.id} style={styles.logRow}><Feather name="coffee" size={18} color={c.primary} /><Text style={[styles.careLabel, { color: c.foreground, marginLeft: 12 }]}>{log.title}</Text></View>) : <Text style={[styles.guideText, { color: c.mutedForeground }]}>امروز هنوز غذایی ثبت نشده است.</Text>}</Card><Text style={[styles.privacy, { color: c.mutedForeground }]}>این راهنما جایگزین دامپزشک نیست. در صورت علائم غیرعادی یا احتمال مسمومیت، با دامپزشک تماس بگیرید.</Text></ScrollView>;

  const screen = tab === 'home' ? <Home /> : tab === 'turtles' ? <Turtles /> : tab === 'calendar' ? <Calendar /> : tab === 'reminders' ? <Reminders /> : tab === 'stats' ? <Stats /> : tab === 'guide' ? <Guide /> : <Settings />;
  const nav = [['home', 'home', 'خانه'], ['turtles', 'heart', 'لاک‌پشت‌ها'], ['calendar', 'calendar', 'تقویم'], ['reminders', 'bell', 'یادآوری'], ['stats', 'bar-chart-2', 'گزارش‌ها'], ['settings', 'settings', 'تنظیمات']] as const;
  return <View style={[styles.container, { backgroundColor: c.background }]}><View style={styles.flex}>{screen}</View><View style={[styles.nav, { backgroundColor: c.card, borderColor: c.border, paddingBottom: Math.max(insets.bottom, 12) }]}>{nav.map(([id, icon, label]) => <Pressable key={id} onPress={() => setTab(id)} style={styles.navItem}><Feather name={icon} size={19} color={tab === id ? c.primary : c.mutedForeground} /><Text style={[styles.navText, { color: tab === id ? c.primary : c.mutedForeground }]}>{label}</Text></Pressable>)}</View>
     <Modal visible={!!modal} animationType="slide" transparent onRequestClose={() => { setModal(null); setEditingTurtleId(null); }}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: c.card }]}><View style={styles.rowBetween}><Text style={[styles.modalTitle, { color: c.foreground }]}>{modal === 'turtle' ? (editingTurtleId ? 'ویرایش لاک‌پشت' : 'افزودن لاک‌پشت') : modal === 'measurement' ? 'ثبت وزن و اندازه' : modal === 'reminder' ? 'یادآوری جدید' : 'ثبت فعالیت'}</Text><Pressable onPress={() => { setModal(null); setEditingTurtleId(null); }}><Feather name="x" size={22} color={c.mutedForeground} /></Pressable></View>{modal === 'turtle' ? <><Field label="نام" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="مثلاً سبزک" c={c} /><Field label="گونه" value={draft.species} onChangeText={(v) => setDraft({ ...draft, species: v })} placeholder="لاک‌پشت ایرانی" c={c} /><View style={styles.two}><Field label="وزن (گرم)" value={draft.weight} onChangeText={(v) => setDraft({ ...draft, weight: v })} placeholder="۸۵۰" c={c} /><Field label="طول لاک (cm)" value={draft.shellLength} onChangeText={(v) => setDraft({ ...draft, shellLength: v })} placeholder="۱۹" c={c} /></View><Field label="یادداشت" value={draft.notes} onChangeText={(v) => setDraft({ ...draft, notes: v })} placeholder="نکته‌ای برای به خاطر سپردن..." c={c} /><Button label={editingTurtleId ? 'ذخیره تغییرات' : 'افزودن لاک‌پشت'} icon="check" onPress={saveTurtle} /></> : modal === 'measurement' ? <><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 12 }]}>برای {selected.name} حداقل یکی از دو مقدار را وارد کنید.</Text><View style={styles.two}><Field label="وزن (گرم)" value={draft.weight} onChangeText={(v) => setDraft({ ...draft, weight: v })} placeholder={selected.weight === '—' ? 'مثلاً ۸۵۰' : selected.weight} c={c} /><Field label="طول لاک (cm)" value={draft.shellLength} onChangeText={(v) => setDraft({ ...draft, shellLength: v })} placeholder={selected.shellLength === '—' ? 'مثلاً ۱۹' : selected.shellLength} c={c} /></View><Field label="یادداشت اندازه‌گیری" value={draft.detail} onChangeText={(v) => setDraft({ ...draft, detail: v })} placeholder="مثلاً بعد از غذا" c={c} /><Button label="ثبت اندازه‌گیری" icon="activity" onPress={addMeasurement} /></> : modal === 'reminder' ? <><Field label="عنوان" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="زمان غذا" c={c} /><Field label="ساعت" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="۱۰:۰۰" c={c} /><Text style={[styles.careTime, { color: c.mutedForeground, marginBottom: 18 }]}>یادآوری روزانه روی همین دستگاه ذخیره و در نسخه اندروید زمان‌بندی می‌شود.</Text><Button label="ذخیره یادآوری" icon="bell" onPress={addReminder} /></> : <><Field label="چه چیزی انجام شد؟" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="قاصدک / آب تازه" c={c} /><Field label="جزئیات" value={draft.detail} onChangeText={(v) => setDraft({ ...draft, detail: v })} placeholder="یک مشت کوچک · ۱۰:۱۵" c={c} /><Button label="ذخیره فعالیت" icon="check" onPress={() => addLog(draft.title === 'آب تازه شد' ? 'آب' : draft.title === 'نور خورشید / UV' ? 'نور' : 'غذا')} /></>}</View></View></Modal>
    <Modal visible={!!deleteCandidate} transparent animationType="fade" onRequestClose={() => setDeleteCandidate(null)}><View style={styles.confirmBackdrop}><View style={[styles.confirmCard, { backgroundColor: c.card }]}><Text style={[styles.modalTitle, { color: c.foreground }]}>حذف لاک‌پشت</Text><Text style={[styles.guideText, { color: c.mutedForeground, marginBottom: 20 }]}>آیا مطمئن هستید که «{deleteCandidate?.name}» و فعالیت‌ها و یادآوری‌های مربوط به آن حذف شود؟</Text><View style={styles.two}><Pressable onPress={() => setDeleteCandidate(null)} style={[styles.button, { backgroundColor: c.secondary }]}><Text style={[styles.buttonText, { color: c.secondaryForeground }]}>انصراف</Text></Pressable><Pressable onPress={confirmDeleteTurtle} style={[styles.button, { backgroundColor: '#C66A62' }]}><Text style={[styles.buttonText, { color: '#FFFFFF' }]}>حذف قطعی</Text></Pressable></View></View></View></Modal>
    </View>;
}

function Field({ label, value, onChangeText, placeholder, c }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; c: typeof colors.light | typeof colors.dark }) { return <View style={styles.field}><Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} /></View>; }

const styles = StyleSheet.create({
  turtleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, marginRight: 8 },
  confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,.45)' },
  confirmCard: { width: '100%', maxWidth: 390, borderRadius: 22, padding: 22 },
  container: { flex: 1 }, flex: { flex: 1 }, scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { paddingBottom: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerCopy: { flex: 1 }, backButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }, h1: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8, marginTop: 5 }, sub: { fontSize: 14, marginTop: 4 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 }, progressCard: { padding: 20 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, progressTitle: { fontSize: 20, fontWeight: '600', marginTop: 8 }, percent: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' }, progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,.22)', borderRadius: 8, marginTop: 20, overflow: 'hidden' }, progressFill: { height: 8, backgroundColor: '#F2C76E', borderRadius: 8 }, progressHint: { color: '#D9EDDB', fontSize: 12, marginTop: 10 }, miniStats: { flexDirection: 'row', gap: 18, marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E6EFE5' }, miniStat: { fontSize: 15, fontWeight: '700' }, guideButton: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, guideText: { fontSize: 15, lineHeight: 25, marginTop: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 }, sectionTitle: { fontSize: 19, fontWeight: '700' }, link: { fontWeight: '600', fontSize: 13 }, muted: { fontSize: 13 }, search: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, marginBottom: 4, fontSize: 14 }, careRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, careIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, careLabel: { fontSize: 15, fontWeight: '600' }, careTime: { fontSize: 12, marginTop: 3 }, strike: { textDecorationLine: 'line-through', opacity: .6 }, check: { width: 23, height: 23, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 }, button: { minHeight: 46, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, flex: 1 }, buttonText: { fontSize: 14, fontWeight: '700' }, logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, dot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 }, logTitle: { fontSize: 15, fontWeight: '600' }, turtleCard: { flexDirection: 'row', alignItems: 'center', gap: 13 }, turtlePhoto: { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%' }, turtleName: { fontSize: 18, fontWeight: '700' }, meta: { fontSize: 12, marginTop: 8 }, month: { fontSize: 18, fontWeight: '700', marginBottom: 18 }, week: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }, day: { color: '#8B9D8D', fontSize: 12, fontWeight: '700' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, date: { width: '14.28%', height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginBottom: 3 }, dateDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 }, reminderRow: { flexDirection: 'row', alignItems: 'center' }, switch: { width: 42, height: 25, borderRadius: 14, padding: 3 }, switchKnob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFFFFF' }, bigNumber: { fontSize: 48, fontWeight: '700', marginTop: 5 }, bigUnit: { fontSize: 24, fontWeight: '500' }, bars: { height: 125, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', marginTop: 12 }, barCol: { height: 125, alignItems: 'center', justifyContent: 'flex-end', gap: 7 }, bar: { width: 20, borderRadius: 7 }, barLabel: { fontSize: 11 }, statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, statCard: { width: '48%', minHeight: 110, marginBottom: 0 }, statValue: { fontSize: 22, fontWeight: '700', marginTop: 12 }, weightLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 90 }, weightPoint: { alignItems: 'center', gap: 5 }, point: { width: 13, height: 13, borderRadius: 7 }, settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, privacy: { textAlign: 'center', lineHeight: 20, fontSize: 12, paddingHorizontal: 20, marginTop: 24 }, nav: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 }, navItem: { alignItems: 'center', gap: 4, minWidth: 48 }, navText: { fontSize: 10, fontWeight: '600' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.4)' }, modal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 }, modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 22 }, field: { marginBottom: 14, flex: 1 }, fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 13, fontSize: 15 }, two: { flexDirection: 'row', gap: 10 },
});
