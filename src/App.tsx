import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Sun, Moon, BookOpen, Upload, Plus, TimerReset, Play, Pause, Sparkles, X, CheckCircle2, CircleHelp, ArrowRight, BarChart3, Crown, Users, Settings, LogIn, LogOut, Bell, Award, Shield, ClipboardList, FileText, Wand2, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const LS_KEYS = {
  QUESTIONS: "mcq_questions_v1",
  USERS: "mcq_users_v1",
  SESSION: "mcq_session_v1",
  SETTINGS: "mcq_settings_v1",
  STATS: "mcq_stats_v1",
};

const loadLS = (k: string, fallback: any) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const saveLS = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v));

interface MCQ {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  topic?: string;
  difficulty: "easy" | "normal" | "hard";
}

interface User {
  uid: string;
  name: string;
  email?: string;
  coins: number;
  streak: number;
  bestStreak: number;
  badges: string[];
  levelUnlocked: { easy: boolean; normal: boolean; hard: boolean };
  dailyGoal: number;
  lastGoalDate?: string;
}

const seedQuestions: MCQ[] = [
  {
    id: "q1",
    question: "Which data structure uses FIFO (First-In, First-Out)?",
    options: ["Stack", "Queue", "Tree", "Graph"],
    answerIndex: 1,
    explanation: "Queues process elements in the order they arrive.",
    topic: "DSA Basics",
    difficulty: "easy",
  },
  {
    id: "q2",
    question: "In accounting, which statement shows a company's financial position at a specific point in time?",
    options: ["Income Statement", "Balance Sheet", "Cash Flow Statement", "Statement of Retained Earnings"],
    answerIndex: 1,
    explanation: "The balance sheet is a snapshot of assets, liabilities, and equity.",
    topic: "Accounting",
    difficulty: "normal",
  },
  {
    id: "q3",
    question: "Which HTTP status code means 'Not Found'?",
    options: ["200", "301", "404", "500"],
    answerIndex: 2,
    explanation: "404 indicates the server can't find the requested resource.",
    topic: "Web Basics",
    difficulty: "easy",
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

function ensureFirstRun() {
  if (!loadLS(LS_KEYS.QUESTIONS, null)) saveLS(LS_KEYS.QUESTIONS, seedQuestions);
  if (!loadLS(LS_KEYS.USERS, null))
    saveLS(LS_KEYS.USERS, {
      guest: {
        uid: "guest",
        name: "Guest",
        coins: 0,
        streak: 0,
        bestStreak: 0,
        badges: [],
        levelUnlocked: { easy: true, normal: false, hard: false },
        dailyGoal: 20,
      } as User,
    });
  if (!loadLS(LS_KEYS.SESSION, null)) saveLS(LS_KEYS.SESSION, { uid: "guest" });
  if (!loadLS(LS_KEYS.SETTINGS, null)) saveLS(LS_KEYS.SETTINGS, { dark: false, notifications: false });
  if (!loadLS(LS_KEYS.STATS, null)) saveLS(LS_KEYS.STATS, { history: [] });
}
ensureFirstRun();

async function requestNotify() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const p = await Notification.requestPermission();
      return p === "granted";
    }
  } catch {}
  return false;
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {}
}

async function extractTextFromPDF(file: File) {
  try {
    const pdfjsLib = await import("pdfjs-dist/build/pdf");
    try {
      // @ts-ignore
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
    } catch {}
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => (it.str ?? "")).join(" ") + "\n";
    }
    return text;
  } catch (e) {
    try {
      const t = await file.text();
      return t;
    } catch {
      return "";
    }
  }
}

function draftMCQsFromText(raw: string, defaultTopic = "General") {
  const sentences = raw
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 40 && /[a-zA-Z]/.test(s))
    .slice(0, 40);
  const mcqs = sentences.map((s, idx) => {
    const words = s.split(" ");
    const mid = Math.max(5, Math.min(words.length - 5, Math.floor(words.length / 2)));
    const answer = words[mid].replace(/[^a-zA-Z0-9%]/g, "");
    const question = s.replace(words[mid], "____");
    const distractor = (seed: string) => (seed + Math.random().toString(36).slice(2, 6)).slice(0, Math.max(3, answer.length));
    const options = [answer, distractor(answer), distractor(answer.toUpperCase()), distractor(answer + "X")];
    const shuffled = options
      .map((o) => ({ o, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.o);
    const answerIndex = shuffled.indexOf(answer);
    const mq: MCQ = {
      id: `draft_${Date.now()}_${idx}_${uid()}`,
      question,
      options: shuffled,
      answerIndex,
      explanation: `The blank was the keyword: ${answer}. Refine this draft in Admin > Edit.`,
      topic: defaultTopic,
      difficulty: idx % 3 === 0 ? "easy" : idx % 3 === 1 ? "normal" : "hard",
    };
    return mq;
  });
  return mcqs;
}

function nextDifficulty(current: string, correctStreak: number, wrongStreak: number) {
  if (correctStreak >= 3) {
    if (current === "easy") return "normal";
    if (current === "normal") return "hard";
  }
  if (wrongStreak >= 2) {
    if (current === "hard") return "normal";
    if (current === "normal") return "easy";
  }
  return current;
}

function TopBar({ dark, setDark, user, onSignOut }: { dark: boolean; setDark: (v: boolean) => void; user: User; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 sm:p-4 sticky top-0 z-40 backdrop-blur bg-background/70 border-b">
      <div className="flex items-center gap-2">
        <Rocket className="h-6 w-6" />
        <span className="font-bold text-lg sm:text-xl">Syllabus Sprint</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={dark} onCheckedChange={setDark} aria-label="Toggle dark mode" />
        {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        <div className="h-6 w-px bg-border mx-2" />
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          <span className="text-sm">{user.coins} coins</span>
        </div>
        <div className="flex items-center gap-2">
          <Flame streak={user.streak} />
        </div>
        <Button size="sm" variant="outline" onClick={onSignOut} className="gap-2"><LogOut className="h-4 w-4"/>Sign out</Button>
      </div>
    </div>
  );
}

function Flame({ streak }: { streak: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm">🔥</span>
      <span className="text-sm font-medium">{streak} day streak</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-5xl mx-auto p-3 sm:p-6">{children}</div>;
}

function SectionTitle({ icon: Icon, title, actions }: { icon: any; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <h2 className="text-lg sm:text-xl font-semibold">{title}</h2>
      </div>
      <div>{actions}</div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm">
      <Icon className="h-4 w-4" />
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function TopicBadge({ name, count, onClick, active }: { name: string; count: number; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-2xl border text-xs sm:text-sm ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
      {name} <span className="opacity-70">({count})</span>
    </button>
  );
}

function DifficultyChips({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {["easy", "normal", "hard"].map((d) => (
        <button key={d} onClick={() => setValue(d)} className={`px-3 py-1 rounded-full border text-xs sm:text-sm ${value === d ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{d.toUpperCase()}</button>
      ))}
    </div>
  );
}

function QuizCard({ mcq, onAnswer, locked }: { mcq: MCQ; onAnswer: (ok: boolean) => void; locked: boolean }) {
  const [selected, setSelected] = useState(-1);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setSelected(-1);
    setRevealed(false);
  }, [mcq?.id]);

  function choose(i: number) {
    if (locked || revealed) return;
    setSelected(i);
    const ok = i === mcq.answerIndex;
    setRevealed(true);
    setTimeout(() => onAnswer(ok), 650);
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs opacity-70">
            <ClipboardList className="h-4 w-4" />
            <span>{mcq.topic ?? "General"}</span>
          </div>
          <div className="text-xs uppercase tracking-wide opacity-70">{mcq.difficulty}</div>
        </div>
        <div className="text-base sm:text-lg font-medium mb-4">{mcq.question}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {mcq.options.map((opt, i) => {
            const isCorrect = i === mcq.answerIndex;
            const chosen = i === selected;
            const status = revealed ? (isCorrect ? "correct" : chosen ? "wrong" : "idle") : "idle";
            return (
              <Button key={i} variant="outline" className={`justify-start h-auto whitespace-normal text-left rounded-xl border-2 py-3 ${status === "correct" ? "border-green-500" : status === "wrong" ? "border-red-500" : "border-border"}`} onClick={() => choose(i)}>
                {revealed && status === "correct" && <CheckCircle2 className="h-4 w-4 mr-2" />}
                {revealed && status === "wrong" && <X className="h-4 w-4 mr-2" />}
                {opt}
              </Button>
            );
          })}
        </div>
        {revealed && (
          <div className="mt-4 text-sm p-3 rounded-xl bg-muted">
            <div className="font-semibold mb-1">Explanation</div>
            <div>{mcq.explanation ?? "No explanation provided yet."}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPanel({ sessionAnswers, onClear }: { sessionAnswers: any[]; onClear: () => void }) {
  return (
    <div className="space-y-3">
      {sessionAnswers.length === 0 && <div className="text-sm opacity-70">No attempts yet.</div>}
      {sessionAnswers.map((a, i) => (
        <Card key={i} className="rounded-2xl">
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">{a.q.question}</div>
            <div className="text-xs mb-1">Topic: {a.q.topic ?? "General"} • Difficulty: {a.q.difficulty}</div>
            <div className="text-sm">Your answer: <span className={a.correct ? "text-green-600" : "text-red-600"}>{a.chosen}</span></div>
            <div className="text-sm">Correct: <span className="font-medium">{a.q.options[a.q.answerIndex]}</span></div>
            <div className="text-sm mt-2 opacity-80">{a.q.explanation}</div>
          </CardContent>
        </Card>
      ))}
      {sessionAnswers.length > 0 && (
        <Button variant="outline" onClick={onClear}>Clear review</Button>
      )}
    </div>
  );
}

function PDFUploader({ onText }: { onText: (text: string) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setLoading(true);
    const text = await extractTextFromPDF(f);
    setLoading(false);
    if (!text || text.trim().length < 20) {
      toast({ title: "Couldn't read PDF", description: "Try another file or paste text manually.", variant: "destructive" });
      return;
    }
    onText(text);
    toast({ title: "Syllabus imported", description: `Extracted ~${text.length} chars. Review drafts below.` });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input type="file" accept="application/pdf,.pdf" ref={fileRef} onChange={(e) => e.target.files && e.target.files[0] && handleFile(e.target.files[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4"/>Upload PDF</Button>
      </div>
      <div className="text-xs opacity-70">If PDF extraction fails, paste text below.</div>
    </div>
  );
}

function BulkUpload({ onImport }: { onImport: (mcqs: MCQ[]) => void }) {
  const [csv, setCsv] = useState("");
  function parseCSV() {
    const rows = csv.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    const out: MCQ[] = [];
    for (const r of rows) {
      const cols = r.split(",").map((c) => c.trim());
      if (cols.length < 7) continue;
      const [q, a, b, c, d, ans, expl, topic = "General", diff = "easy"] = cols;
      const idx = Math.min(3, Math.max(0, Number(ans) || 0));
      out.push({ id: uid(), question: q, options: [a, b, c, d], answerIndex: idx, explanation: expl, topic, difficulty: diff as any });
    }
    onImport(out);
  }
  return (
    <div className="space-y-2">
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Paste CSV: question, A, B, C, D, answerIndex, explanation, topic, difficulty" className="min-h-[120px]"/>
      <Button onClick={parseCSV} className="gap-2"><Plus className="h-4 w-4"/>Import CSV</Button>
    </div>
  );
}

function Leaderboard({ users }: { users: Record<string, User> }) {
  const sorted = Object.values(users).sort((a, b) => (b.coins - a.coins) || (b.bestStreak - a.bestStreak));
  return (
    <div className="space-y-3">
      {sorted.map((u, i) => (
        <Card key={u.uid} className="rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted grid place-items-center font-semibold">{i + 1}</div>
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs opacity-70">Best streak: {u.bestStreak}d</div>
              </div>
            </div>
            <div className="flex items-center gap-2"><Crown className="h-4 w-4"/> {u.coins} coins</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsChart({ stats }: { stats: any }) {
  const data = stats.history.slice(-14).map((h: any) => ({ date: (h.date || "").slice(5), correct: Number(h.correct) || 0, attempted: Number(h.attempted) || 0 }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="attempted" strokeWidth={2} />
          <Line type="monotone" dataKey="correct" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignIn({ onSignIn }: { onSignIn: (data: { name: string; email: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Card className="max-w-md w-full rounded-3xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2"><Shield className="h-5 w-5"/><div className="text-lg font-semibold">Welcome to Syllabus Sprint</div></div>
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email or Mobile" value={email} onChange={(e) => setEmail(e.target.value)} />
          {otpMode && <Input placeholder="Enter OTP (mock)" value={otp} onChange={(e) => setOtp(e.target.value)} />}
          <div className="flex gap-2">
            <Button className="gap-2 flex-1" onClick={() => onSignIn({ name: name || "Learner", email })}><LogIn className="h-4 w-4"/> Sign in</Button>
            <Button variant="outline" className="flex-1" onClick={() => setOtpMode(!otpMode)}>{otpMode ? "Use Email" : "Use OTP"}</Button>
          </div>
          <Button variant="outline" className="w-full gap-2"><img alt="google" className="h-4 w-4" src="https://www.svgrepo.com/show/475656/google-color.svg"/> Continue with Google</Button>
          <div className="text-xs opacity-70">Authentication is demo only. Hook up Firebase/Auth0/Supabase in production.</div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminPanel({ questions, setQuestions }: { questions: MCQ[]; setQuestions: (q: MCQ[]) => void }) {
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [topic, setTopic] = useState("General");
  const [filter, setFilter] = useState("");
  const [difficulty, setDifficulty] = useState<"easy"|"normal"|"hard">("easy");

  function addDraftsFromText(t: string) {
    const drafts = draftMCQsFromText(t, topic);
    const next = [...questions, ...drafts];
    setQuestions(next);
    saveLS(LS_KEYS.QUESTIONS, next);
    toast({ title: `Drafted ${drafts.length} MCQs`, description: "Review & edit before publishing." });
  }

  function addManual() {
    const q: MCQ = { id: uid(), question: "New question?", options: ["A","B","C","D"], answerIndex: 0, explanation: "Explain here", topic, difficulty };
    const next = [q, ...questions];
    setQuestions(next); saveLS(LS_KEYS.QUESTIONS, next);
  }

  function deleteQ(id: string) {
    const next = questions.filter((q) => q.id !== id);
    setQuestions(next); saveLS(LS_KEYS.QUESTIONS, next);
  }

  function updateQ(id: string, patch: Partial<MCQ>) {
    const next = questions.map((q) => q.id === id ? { ...q, ...patch } : q);
    setQuestions(next); saveLS(LS_KEYS.QUESTIONS, next);
  }

  const filtered = useMemo(() => questions.filter((q) => q.question.toLowerCase().includes(filter.toLowerCase()) || (q.topic || "").toLowerCase().includes(filter.toLowerCase())), [questions, filter]);

  return (
    <div className="grid gap-6">
      <SectionTitle icon={Settings} title="Admin – Question Builder" actions={<></>} />
      <Card className="rounded-2xl">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <SectionTitle icon={FileText} title="Import from PDF" />
          <PDFUploader onText={(t) => setRawText(t)} />
          <Textarea placeholder="Or paste syllabus text here…" value={rawText} onChange={(e) => setRawText(e.target.value)} className="min-h-[120px]"/>
          <div className="flex gap-2 items-center">
            <Input placeholder="Topic/Chapter" value={topic} onChange={(e) => setTopic(e.target.value)} className="max-w-xs"/>
            <Button className="gap-2" onClick={() => addDraftsFromText(rawText)} disabled={!rawText.trim()}><Wand2 className="h-4 w-4"/> AI-draft MCQs</Button>
          </div>
          <SectionTitle icon={Plus} title="Manual / Bulk" />
          <div className="flex gap-2 items-center">
            <Button variant="outline" className="gap-2" onClick={addManual}><Plus className="h-4 w-4"/> New MCQ</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Upload className="h-4 w-4"/> Bulk CSV</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl max-w-2xl">
                <DialogHeader><DialogTitle>Bulk Upload CSV</DialogTitle></DialogHeader>
                <BulkUpload onImport={(arr) => { const next = [...questions, ...arr]; setQuestions(next); saveLS(LS_KEYS.QUESTIONS, next); }} />
              </DialogContent>
            </Dialog>
            <div className="ml-auto flex items-center gap-2">
              <Input placeholder="Search question/topic" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} className="border rounded-lg px-2 py-1 text-sm">
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {filtered.length === 0 && <div className="text-sm opacity-70">No questions yet. Create some!</div>}
        {filtered.map((q) => (
          <Card key={q.id} className="rounded-2xl">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Input className="font-medium" value={q.question} onChange={(e) => updateQ(q.id, { question: e.target.value })} />
                <Button variant="outline" onClick={() => deleteQ(q.id)} className="ml-auto">Delete</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {q.options.map((opt, i) => (
                  <Input key={i} value={opt} onChange={(e) => updateQ(q.id, { options: q.options.map((o, j) => j === i ? e.target.value : o) })} />
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>Correct index:</span>
                <Input type="number" className="w-20" value={q.answerIndex} onChange={(e) => {
                  const idx = Math.min(3, Math.max(0, Number(e.target.value) || 0));
                  updateQ(q.id, { answerIndex: idx });
                }} />
                <Input placeholder="Topic" value={q.topic ?? ""} onChange={(e) => updateQ(q.id, { topic: e.target.value })} className="max-w-xs" />
                <select value={q.difficulty} onChange={(e) => updateQ(q.id, { difficulty: e.target.value as any })} className="border rounded-lg px-2 py-1">
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <Textarea placeholder="Explanation" value={q.explanation ?? ""} onChange={(e) => updateQ(q.id, { explanation: e.target.value })} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(loadLS(LS_KEYS.SETTINGS, { dark: false, notifications: false }));
  const [session, setSession] = useState(loadLS(LS_KEYS.SESSION, { uid: "guest" }));
  const users = loadLS(LS_KEYS.USERS, {});
  const [user, setUser] = useState(users[session.uid] || users.guest);
  const [questions, setQuestions] = useState<MCQ[]>(loadLS(LS_KEYS.QUESTIONS, []));
  const [tab, setTab] = useState("learn");
  const [topicFilter, setTopicFilter] = useState("All");
  const [diff, setDiff] = useState<"easy"|"normal"|"hard">("easy");
  const [adaptive, setAdaptive] = useState(true);
  const [timerOn, setTimerOn] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState<MCQ[]>([]);
  const [sessionAnswers, setSessionAnswers] = useState<any[]>([]);
  const [streakCorrect, setStreakCorrect] = useState(0);
  const [streakWrong, setStreakWrong] = useState(0);
  const stats = loadLS(LS_KEYS.STATS, { history: [] });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.dark);
    saveLS(LS_KEYS.SETTINGS, settings);
  }, [settings]);

  useEffect(() => {
    const today = todayISO();
    if (user.lastGoalDate !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yISO = y.toISOString().slice(0, 10);
      const freshStats = loadLS(LS_KEYS.STATS, { history: [] });
      const allUsers = loadLS(LS_KEYS.USERS, {});
      const yesterday = freshStats.history.find((h: any) => h.date === yISO);
      const goal = (allUsers[user.uid]?.dailyGoal ?? 20);
      const met = !!(yesterday && Number(yesterday.attempted) >= goal);
      const updated = { ...allUsers[user.uid], lastGoalDate: today, streak: met ? allUsers[user.uid].streak + 1 : met === false ? 0 : allUsers[user.uid].streak, bestStreak: Math.max(allUsers[user.uid].bestStreak, met ? allUsers[user.uid].streak + 1 : allUsers[user.uid].bestStreak) };
      const all = { ...allUsers, [user.uid]: updated };
      saveLS(LS_KEYS.USERS, all);
      setUser(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!timerOn) return;
    if (timeLeft <= 0) {
      setTimerOn(false);
      toast({ title: "Time up!", variant: "destructive" });
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerOn, timeLeft, toast]);

  useEffect(() => {
    const pool = questions.filter((q) => (topicFilter === "All" || q.topic === topicFilter) && q.difficulty === diff);
    const pick = pool.slice().sort(() => 0.5 - Math.random()).slice(0, 10);
    setCurrentSet(pick);
    setCurrentIndex(0);
    setSessionAnswers([]);
    setStreakCorrect(0);
    setStreakWrong(0);
    setTimeLeft(30);
  }, [questions, topicFilter, diff]);

  const topics = useMemo(() => {
    const map = new Map();
    questions.forEach((q) => map.set(q.topic ?? "General", (map.get(q.topic ?? "General") || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [questions]);

  function handleAnswer(ok: boolean) {
    const q = currentSet[currentIndex];
    const chosen = "(selected option)";
    setSessionAnswers((a) => [...a, { q, correct: ok, chosen }]);

    const usersAll = loadLS(LS_KEYS.USERS, {});
    const me = usersAll[user.uid];
    const coinsDelta = ok ? 5 : 0;
    const updated = { ...me, coins: me.coins + coinsDelta };
    usersAll[user.uid] = updated; saveLS(LS_KEYS.USERS, usersAll); setUser(updated);

    const sc = ok ? streakCorrect + 1 : 0;
    const sw = ok ? 0 : streakWrong + 1;
    setStreakCorrect(sc); setStreakWrong(sw);

    if (adaptive) setDiff((d) => nextDifficulty(d, sc, sw) as any);

    if (currentIndex < currentSet.length - 1) {
      setCurrentIndex((i) => i + 1);
      if (timerOn) setTimeLeft(30);
    } else {
      const today = todayISO();
      const st = loadLS(LS_KEYS.STATS, { history: [] });
      const prev = st.history.find((h: any) => h.date === today);
      const correctCount = (sessionAnswers.filter((x) => x.correct).length + (ok ? 1 : 0));
      if (prev) { prev.attempted += currentSet.length; prev.correct += correctCount; }
      else st.history.push({ date: today, attempted: currentSet.length, correct: correctCount });
      saveLS(LS_KEYS.STATS, st);
      setTimeout(() => {
        notify("Great job!", `You finished a set. Coins: +${correctCount * 5}`);
        toast({ title: "Set complete", description: "Check Review tab for explanations." });
      }, 400);
    }
  }

  function startTimer() {
    setTimerOn(true); setTimeLeft(30);
  }

  function signOut() {
    setSession({ uid: "guest" }); saveLS(LS_KEYS.SESSION, { uid: "guest" }); setUser(loadLS(LS_KEYS.USERS, {}).guest);
  }

  function signInBasic({ name, email }: { name: string; email: string }) {
    const all = loadLS(LS_KEYS.USERS, {});
    const uidv = uid();
    const profile: User = { uid: uidv, name, email, coins: 0, streak: 0, bestStreak: 0, badges: [], levelUnlocked: { easy: true, normal: false, hard: false }, dailyGoal: 20, lastGoalDate: todayISO() };
    all[uidv] = profile; saveLS(LS_KEYS.USERS, all);
    setSession({ uid: uidv }); saveLS(LS_KEYS.SESSION, { uid: uidv });
    setUser(profile);
  }

  const topicsAll = [{ name: "All", count: questions.length }, ...topics];

  if (!user || (session.uid === "guest" && user.uid === "guest")) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SignIn onSignIn={signInBasic} />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar dark={settings.dark} setDark={(v) => setSettings((s) => ({ ...s, dark: v }))} user={user} onSignOut={signOut} />
      <Shell>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 rounded-2xl">
            <TabsTrigger value="learn" className="gap-2"><BookOpen className="h-4 w-4"/> Learn</TabsTrigger>
            <TabsTrigger value="review" className="gap-2"><CircleHelp className="h-4 w-4"/> Review</TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2"><Users className="h-4 w-4"/> Leaderboard</TabsTrigger>
            <TabsTrigger value="stats" className="gap-2"><BarChart3 className="h-4 w-4"/> Stats</TabsTrigger>
            <TabsTrigger value="admin" className="gap-2"><Settings className="h-4 w-4"/> Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="learn" className="mt-4">
            <div className="grid gap-4">
              <SectionTitle icon={Sparkles} title="Playful Practice" actions={<div className="flex items-center gap-2">
                <DifficultyChips value={diff} setValue={setDiff} />
                <div className="h-6 w-px bg-border" />
                <div className="text-xs flex items-center gap-2"><TimerReset className="h-4 w-4"/>Timed</div>
                <Switch checked={timerOn} onCheckedChange={(v) => { setTimerOn(v); if (v) setTimeLeft(30); }} />
                {!settings.notifications && <Button variant="outline" size="sm" className="gap-2" onClick={async () => { const ok = await requestNotify(); setSettings((s) => ({ ...s, notifications: ok })); }}><Bell className="h-4 w-4"/> Remind me daily</Button>}
              </div>} />

              <div className="flex flex-wrap gap-2">
                {topicsAll.map((t) => (
                  <TopicBadge key={t.name} name={t.name} count={t.count} onClick={() => setTopicFilter(t.name)} active={topicFilter === t.name} />
                ))}
              </div>

              <div className="flex items-center gap-3">
                <StatPill icon={Trophy} label="Progress" value={`${currentIndex}/${currentSet.length || 10}`} />
                <StatPill icon={Award} label="Correct Streak" value={streakCorrect} />
                <StatPill icon={Crown} label="Coins" value={user.coins} />
                <div className="ml-auto flex items-center gap-2">
                  <div className="text-sm">Time left:</div>
                  <div className="text-lg font-bold tabular-nums">{timerOn ? `${timeLeft}s` : "--"}</div>
                  {!timerOn ? <Button onClick={startTimer} className="gap-2"><Play className="h-4 w-4"/>Start</Button> : <Button variant="outline" onClick={() => setTimerOn(false)} className="gap-2"><Pause className="h-4 w-4"/>Pause</Button>}
                </div>
              </div>

              {currentSet.length === 0 ? (
                <div className="text-sm opacity-70">No questions match this filter. Add some in Admin or switch topic/difficulty.</div>
              ) : (
                <QuizCard mcq={currentSet[currentIndex]} onAnswer={handleAnswer} locked={timerOn && timeLeft <= 0} />
              )}

              <Progress value={(currentIndex / Math.max(1, currentSet.length)) * 100} className="h-2 rounded-full" />
            </div>
          </TabsContent>

          <TabsContent value="review" className="mt-4">
            <SectionTitle icon={ClipboardList} title="Review & Explanations" />
            <ReviewPanel sessionAnswers={sessionAnswers} onClear={() => setSessionAnswers([])} />
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <SectionTitle icon={Crown} title="Leaderboard" />
            <Leaderboard users={loadLS(LS_KEYS.USERS, {})} />
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <SectionTitle icon={BarChart3} title="Your Progress" />
            <Card className="rounded-2xl"><CardContent className="p-4"><StatsChart stats={loadLS(LS_KEYS.STATS, { history: [] })} /></CardContent></Card>
          </TabsContent>

          <TabsContent value="admin" className="mt-4">
            <AdminPanel questions={questions} setQuestions={setQuestions} />
          </TabsContent>
        </Tabs>

        <div className="mt-8 grid gap-3">
          <Card className="rounded-2xl">
            <CardContent className="p-4 sm:p-6 grid sm:grid-cols-3 gap-4 items-center">
              <div className="sm:col-span-2">
                <div className="font-semibold mb-1">How to deploy</div>
                <div className="text-sm opacity-80">
                  This is a single-file React prototype. For production, drop it into a Next.js app (app/page.tsx), add a real backend (Node/Django) for auth & storage, and wire PDF parsing with PyMuPDF or pdfjs on the server. Add service worker for offline (PWA) and Firebase/Supabase for auth + push.
                </div>
              </div>
              <div className="justify-self-end">
                <Button className="gap-2">Readme & Steps <ArrowRight className="h-4 w-4"/></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Shell>
      <Toaster />
    </div>
  );
}