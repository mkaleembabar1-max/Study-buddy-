import { useState, useEffect, useRef, useCallback } from "react";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const SUBJECT_DEFS = [
  { name: "Mathematics", icon: "📐", color: "#6C63FF" },
  { name: "Physics",     icon: "⚛️",  color: "#FF6B35" },
  { name: "Chemistry",   icon: "🧪",  color: "#3B82F6" },
  { name: "English",     icon: "📖",  color: "#EC4899" },
  { name: "Biology",     icon: "🌿",  color: "#10B981" },
  { name: "Pak Studies", icon: "🌍",  color: "#F59E0B" },
];

const SYSTEM_PROMPT = `You are Study Buddy, a warm and knowledgeable AI academic tutor for students aged 15–25. Help with any subject — explain clearly with examples, quiz students, give study tips, and stay encouraging. Keep answers concise. End with a follow-up to keep the student engaged.`;

const QUOTES = [
  "Discipline today, success tomorrow.",
  "Small progress is still progress.",
  "Every expert was once a beginner.",
  "Study hard, dream big, achieve more.",
  "Consistency beats talent every time.",
  "The secret of getting ahead is getting started.",
  "Focus on the step in front of you.",
];

const MODES = {
  focus: { label: "Focus",       min: 25, color: "#6C63FF" },
  short: { label: "Short Break", min: 5,  color: "#10B981" },
  long:  { label: "Long Break",  min: 15, color: "#3B82F6" },
};

const DAYS_W = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── STORAGE HELPERS ────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = sessionStorage.getItem("sb_state");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState(s) {
  try { sessionStorage.setItem("sb_state", JSON.stringify(s)); } catch {}
}

function makeInitState(name) {
  const today = new Date().toDateString();
  return {
    name,
    // subjects: { [name]: { minutes: 0, sessions: 0, accuracy: [] } }
    subjects: Object.fromEntries(SUBJECT_DEFS.map(s => [s.name, { minutes: 0, sessions: 0, accuracy: [] }])),
    tasks: [],
    // weekly: { [dateStr]: minutes }
    weekly: {},
    // streak
    lastStudyDate: null,
    streak: 0,
    bestStreak: 0,
    // achievements unlocked flags
    achievements: { streak7: false, hours50: false, topScorer: false, goalCrusher: false },
    // daily goal in minutes
    dailyGoalMins: 120, // 2h default
    // planner tasks
    plannerTasks: [],
    // notes saved from AI tutor
    tutorNotes: [],
    createdAt: today,
  };
}

// ── DERIVED STATS ──────────────────────────────────────────────────────────────
function getTotalMinutes(state) {
  return Object.values(state.subjects).reduce((a, s) => a + s.minutes, 0);
}
function formatMins(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function getWeeklyData(state) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    days.push((state.weekly[key] || 0) / 60); // hours
  }
  return days;
}
function getPeakDayIdx(weekly) {
  return weekly.indexOf(Math.max(...weekly));
}
function getSubjectProgress(subj) {
  // progress = sessions logged, each session = 1 point toward 20 "full"
  const pts = Math.min(subj.sessions, 20);
  return Math.round((pts / 20) * 100);
}
function getOverallProgress(state) {
  const progs = SUBJECT_DEFS.map(d => getSubjectProgress(state.subjects[d.name]));
  return Math.round(progs.reduce((a, b) => a + b, 0) / progs.length);
}
function getTaskStats(state) {
  const total = state.plannerTasks.length;
  const done  = state.plannerTasks.filter(t => t.done).length;
  return { total, done };
}
function checkAchievements(state) {
  const ach = { ...state.achievements };
  const totalMins = getTotalMinutes(state);
  if (state.streak >= 7) ach.streak7 = true;
  if (totalMins >= 3000) ach.hours50 = true; // 50 hours
  const allAccs = Object.values(state.subjects).flatMap(s => s.accuracy);
  if (allAccs.length > 0 && allAccs.some(a => a >= 90)) ach.topScorer = true;
  const { total, done } = getTaskStats(state);
  if (total >= 5 && done === total) ach.goalCrusher = true;
  return ach;
}

// ── SHARED COMPONENTS ──────────────────────────────────────────────────────────
function CircleProgress({ value, max, size=90, stroke=8, color="#6C63FF", label, sublabel }) {
  const pct = max === 0 ? 0 : Math.min(value / max, 1);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = pct * circ;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8EEFF" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontWeight:800,fontSize:size>80?20:14,color:"#1e3a5f",lineHeight:1}}>{label}</span>
        {sublabel && <span style={{fontSize:10,color:"#64748b",marginTop:2}}>{sublabel}</span>}
      </div>
    </div>
  );
}

function BarMini({ data, color="#6C63FF", hiIdx }) {
  const max = Math.max(...data, 0.01);
  const highlight = hiIdx !== undefined ? hiIdx : data.indexOf(Math.max(...data));
  return (
    <div style={{display:"flex",gap:3,alignItems:"flex-end",height:44}}>
      {data.map((v,i) => (
        <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1}}>
          <div style={{width:"100%",borderRadius:3,height:`${Math.max((v/max)*36,2)}px`,background:i===highlight?color:`${color}40`}}/>
          <span style={{fontSize:8,color:"#94a3b8"}}>{"MTWTFSS"[i]}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, days }) {
  const w=320,h=90,pad=16;
  const max = Math.max(...data, 0.1) + 0.5;
  const pts = data.map((v,i) => ({
    x: pad + (i/(data.length-1))*(w-pad*2),
    y: h - pad - (v/max)*(h-pad*2),
  }));
  const path = pts.map((p,i) => `${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  const peakIdx = data.indexOf(Math.max(...data));
  const peakPt = pts[peakIdx];
  const peakVal = data[peakIdx];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{overflow:"visible"}}>
      <defs><linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6C63FF" stopOpacity="0.25"/>
        <stop offset="100%" stopColor="#6C63FF" stopOpacity="0"/>
      </linearGradient></defs>
      <path d={`${path} L${pts[pts.length-1].x},${h-pad} L${pts[0].x},${h-pad} Z`} fill="url(#lg2)"/>
      <path d={path} fill="none" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={i===peakIdx?5:3} fill={i===peakIdx?"#6C63FF":"white"} stroke="#6C63FF" strokeWidth="2"/>
          {i===peakIdx && peakVal > 0 && (
            <>
              <rect x={p.x-28} y={p.y-26} width={56} height={18} rx={5} fill="#1e3a5f"/>
              <text x={p.x} y={p.y-13} textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
                {days[i]} {formatMins(Math.round(peakVal*60))}
              </text>
            </>
          )}
          <text x={p.x} y={h} textAnchor="middle" fontSize="9" fill="#94a3b8">{days[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function DonutChart({ subjects, subjectDefs }) {
  // Build slice data from real subject minutes
  const totalMins = subjects ? Object.values(subjects).reduce((a,s)=>a+s.minutes,0) : 0;
  let sliceData;
  if (totalMins === 0) {
    // equal slices placeholder
    sliceData = subjectDefs.map((d,i) => ({ name:d.name, color:d.color, pct: Math.round(100/subjectDefs.length) }));
  } else {
    sliceData = subjectDefs.map(d => ({
      name: d.name, color: d.color,
      pct: Math.round((subjects[d.name].minutes / totalMins) * 100),
    })).filter(s => s.pct > 0);
  }

  const r=46, cx=65, cy=65, stroke=18, circ=2*Math.PI*r;
  const gap = 2; // gap in degrees between slices
  let cum = 0;
  const slices = sliceData.map(s => {
    const rot = (cum/100)*360 - 90 + gap/2;
    const pctAdj = Math.max(0, s.pct - (gap/(360/100)));
    cum += s.pct;
    return { ...s, rot, pctAdj };
  });

  return (
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      <svg width={130} height={130} viewBox="0 0 130 130">
        {slices.map((s,i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${(s.pctAdj/100)*circ} ${circ}`}
            transform={`rotate(${s.rot} ${cx} ${cy})`}/>
        ))}
        <text x={cx} y={cy-4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1e3a5f">
          {totalMins === 0 ? "0h" : formatMins(totalMins).split(" ")[0]}
        </text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize="9" fill="#64748b">
          {totalMins === 0 ? "No data" : (formatMins(totalMins).split(" ")[1] || "total")}
        </text>
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {slices.map((s,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0}}/>
            <span style={{fontSize:10,color:"#475569"}}>{s.name}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#1e3a5f",marginLeft:"auto",paddingLeft:8}}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ONBOARDING ─────────────────────────────────────────────────────────────────
function Onboarding({ onDone }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(120);
  const [step, setStep] = useState(0);

  const finish = () => {
    if (!name.trim()) return;
    onDone(name.trim(), goal);
  };

  return (
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"linear-gradient(160deg,#eef0ff 0%,#f0f9ff 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Nunito','Segoe UI',sans-serif",boxSizing:"border-box"}}>
      <div style={{fontSize:56,marginBottom:8}}>📚</div>
      <h1 style={{margin:0,fontSize:26,fontWeight:900,color:"#1e3a5f",textAlign:"center"}}>Welcome to Study Buddy</h1>
      <p style={{color:"#64748b",textAlign:"center",fontSize:13,marginTop:6,marginBottom:28}}>Your personal academic tracker. Let's get you set up!</p>

      {step === 0 && (
        <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>
          <label style={{fontSize:13,fontWeight:700,color:"#1e3a5f"}}>What's your name?</label>
          <input
            autoFocus
            value={name}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep(1)}
            placeholder="Enter your name..."
            style={{border:"2px solid #c7d2fe",borderRadius:12,padding:"12px 16px",fontSize:15,outline:"none",fontFamily:"inherit",color:"#1e3a5f",background:"white",boxSizing:"border-box",width:"100%"}}
          />
          <button
            onClick={()=>name.trim()&&setStep(1)}
            disabled={!name.trim()}
            style={{background:name.trim()?"linear-gradient(135deg,#6C63FF,#8B83FF)":"#e2e8f0",color:name.trim()?"white":"#94a3b8",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:name.trim()?"pointer":"not-allowed",fontFamily:"inherit",marginTop:4}}>
            Next →
          </button>
        </div>
      )}

      {step === 1 && (
        <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>
          <label style={{fontSize:13,fontWeight:700,color:"#1e3a5f"}}>Daily study goal</label>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[[60,"1 hour — light session"],[120,"2 hours — balanced"],[180,"3 hours — dedicated"],[240,"4 hours — intensive"]].map(([mins,lbl])=>(
              <button key={mins} onClick={()=>setGoal(mins)} style={{background:goal===mins?"linear-gradient(135deg,#6C63FF,#8B83FF)":"white",color:goal===mins?"white":"#1e3a5f",border:`2px solid ${goal===mins?"#6C63FF":"#e2e8f0"}`,borderRadius:12,padding:"11px 16px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={finish} style={{background:"linear-gradient(135deg,#6C63FF,#8B83FF)",color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
            Let's Start! 🚀
          </button>
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
function Dashboard({ state, onTabChange }) {
  const totalMins = getTotalMinutes(state);
  const weekly = getWeeklyData(state);
  const peakIdx = getPeakDayIdx(weekly);
  const overall = getOverallProgress(state);
  const { total: taskTotal, done: taskDone } = getTaskStats(state);
  const todayMins = state.weekly[new Date().toDateString()] || 0;
  const goalPct = Math.min(Math.round((todayMins / state.dailyGoalMins) * 100), 100);
  const quoteIdx = new Date().getDate() % QUOTES.length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  // 7-day streak display
  const streakDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    streakDays.push((state.weekly[key] || 0) > 0);
  }

  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <h2 style={{margin:0,fontSize:19,fontWeight:800,color:"#1e3a5f"}}>{greeting}, {state.name} 👋</h2>
          <p style={{margin:0,fontSize:11,color:"#64748b"}}>Ready to achieve your goals today?</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <div style={{background:"#fff4ec",borderRadius:12,padding:"7px 11px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:17}}>🔥</span>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:"#FF6B35",lineHeight:1}}>{state.streak}</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>Day Streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 cards */}
      <div style={{display:"grid",gridTemplateColumns:"1.1fr 1fr 1fr",gap:9}}>
        <div style={{background:"linear-gradient(135deg,#6C63FF,#9B93FF)",borderRadius:15,padding:13,color:"white"}}>
          <div style={{fontSize:9,opacity:0.8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Today's Goal</div>
          <div style={{fontSize:28,fontWeight:900,lineHeight:1.1}}>{goalPct}%</div>
          <div style={{fontSize:11,opacity:0.9}}>{formatMins(todayMins)} / {formatMins(state.dailyGoalMins)}</div>
          {goalPct>=100&&<div style={{marginTop:5,fontSize:9,opacity:0.9}}>Goal achieved! 🎉</div>}
        </div>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Progress</div>
          <CircleProgress value={overall} max={100} size={64} stroke={6} color="#6C63FF" label={`${overall}%`}/>
          <div style={{fontSize:10,color:"#6C63FF",fontWeight:600,marginTop:5}}>Overall</div>
        </div>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:10}}>
          <div style={{fontSize:9,color:"#10B981",textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>Tasks</div>
          <div style={{fontSize:24,fontWeight:900,color:"#1e3a5f",marginTop:3}}>{taskDone}/{taskTotal}</div>
          <div style={{fontSize:10,color:"#64748b"}}>Done today</div>
          <div style={{height:5,background:"#e2e8f0",borderRadius:3,marginTop:7,overflow:"hidden"}}>
            <div style={{width:`${taskTotal>0?(taskDone/taskTotal)*100:0}%`,height:"100%",background:"linear-gradient(90deg,#10B981,#34d399)",borderRadius:3}}/>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:12}}>
          <div style={{fontSize:10,color:"#64748b"}}>Total Study Hours</div>
          <div style={{fontSize:18,fontWeight:900,color:"#1e3a5f",marginTop:1}}>{formatMins(totalMins)}</div>
          <div style={{fontSize:9,color:"#94a3b8",marginBottom:6}}>All time</div>
          <BarMini data={weekly} color="#6C63FF" hiIdx={peakIdx}/>
        </div>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{fontSize:10,color:"#64748b",alignSelf:"flex-start"}}>Tasks Completed</div>
          <div style={{fontSize:18,fontWeight:900,color:"#1e3a5f",marginTop:1,alignSelf:"flex-start"}}>{taskDone} / {taskTotal || "—"}</div>
          <div style={{fontSize:9,color:"#94a3b8",marginBottom:6,alignSelf:"flex-start"}}>{taskTotal===0?"No tasks yet":"Today's plan"}</div>
          <CircleProgress value={taskDone} max={taskTotal||1} size={58} stroke={6} color="#10B981" label={taskTotal>0?`${Math.round((taskDone/taskTotal)*100)}%`:"—"}/>
        </div>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:12}}>
          <div style={{fontSize:10,color:"#64748b"}}>Current Streak</div>
          <div style={{fontSize:18,fontWeight:900,color:"#1e3a5f",marginTop:1}}>{state.streak} Days</div>
          <div style={{fontSize:9,color:"#64748b",marginBottom:6}}>Best: {state.bestStreak} Days 🏆</div>
          <div style={{display:"flex",gap:2}}>
            {streakDays.map((v,i)=><span key={i} style={{fontSize:14}}>{v?"🔥":"⬜"}</span>)}
          </div>
        </div>
        <div style={{background:"white",border:"1px solid #e8eeff",borderRadius:15,padding:12}}>
          <div style={{fontSize:10,color:"#64748b"}}>Today's Progress</div>
          <div style={{fontSize:18,fontWeight:900,color:"#1e3a5f",marginTop:1}}>{goalPct}%</div>
          <div style={{fontSize:9,color:"#64748b",marginBottom:8}}>Goal: {formatMins(state.dailyGoalMins)}/day</div>
          <div style={{height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${goalPct}%`,height:"100%",background:"linear-gradient(90deg,#6C63FF,#a78bfa)",borderRadius:3,transition:"width 0.5s"}}/>
          </div>
          <div style={{fontSize:10,color:"#6C63FF",marginTop:4,fontWeight:600}}>{formatMins(todayMins)} / {formatMins(state.dailyGoalMins)}</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        <div style={{background:"white",border:"1px solid #e8
