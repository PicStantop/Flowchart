import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPA_URL = "https://bbgknqoqnpzlxczlqrew.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZ2tucW9xbnB6bHhjemxxcmV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDY5MzcsImV4cCI6MjA5MzkyMjkzN30.X5hv3ePicD8P-qSkyPW5dyBrmUlSoSqPdKCI6xdlBZU";
const db = createClient(SUPA_URL, SUPA_KEY);

// ── DB helpers ────────────────────────────────────────────────────────────────
async function dbLoadUsers() {
  try {
    const [{ data: users }, { data: prog }] = await Promise.all([
      db.from("users").select("*"),
      db.from("progress").select("*"),
    ]);
    return (users || []).map(u => ({
      id: u.id, name: u.name, level: u.level, createdAt: u.created_at,
      progress: Object.fromEntries(
        (prog || []).filter(p => p.user_id === u.id).map(p => [
          p.exercise_id,
          { completed: p.completed, attempts: p.attempts,
            lastAttempt: p.last_attempt, completedAt: p.completed_at },
        ])
      ),
    }));
  } catch { return []; }
}

async function dbRegisterUser(user) {
  const { error } = await db.from("users").insert({
    id: user.id, name: user.name, level: user.level, created_at: user.createdAt,
  });
  return !error;
}

async function dbSaveProgress(userId, exId, data) {
  await db.from("progress").upsert({
    user_id: userId, exercise_id: exId,
    completed: data.completed, attempts: data.attempts,
    last_attempt: data.lastAttempt || null,
    completed_at: data.completedAt || null,
  }, { onConflict: "user_id,exercise_id" });
}

async function dbLoadCustomEx() {
  try {
    const { data } = await db.from("custom_exercises").select("*");
    const out = { jss2: [], ss2: [] };
    (data || []).forEach(ex => {
      if (out[ex.level]) out[ex.level].push({
        id: ex.id, title: ex.title, desc: ex.description,
        hint: ex.hint || "", steps: ex.steps, req: ex.req,
      });
    });
    return out;
  } catch { return { jss2: [], ss2: [] }; }
}

async function dbAddCustomEx(level, ex) {
  await db.from("custom_exercises").insert({
    id: ex.id, level, title: ex.title, description: ex.desc,
    hint: ex.hint, steps: ex.steps, req: ex.req,
  });
}

async function dbDeleteCustomEx(id) {
  await db.from("custom_exercises").delete().eq("id", id);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID = 28;
const snap = v => Math.round(v / GRID) * GRID;
const TEACHER_PASS = "teacher2024";
const MAX_HIST = 40;

const DIM = { terminal:[148,52], process:[148,52], decision:[148,72], io:[148,52] };
const W = t => DIM[t][0], H = t => DIM[t][1];

const SYM = {
  terminal:{ label:"Start / End",    fill:"#34d399", stroke:"#059669", text:"#064e3b" },
  process: { label:"Process",        fill:"#60a5fa", stroke:"#2563eb", text:"#1e3a8a" },
  decision:{ label:"Decision (If)",  fill:"#fbbf24", stroke:"#d97706", text:"#78350f" },
  io:      { label:"Input / Output", fill:"#e879f9", stroke:"#a21caf", text:"#4a044e" },
};
const SYM_ORDER = ["terminal","process","decision","io"];
const DEF_TEXT  = { terminal:"Start", process:"Process", decision:"Condition?", io:"Input / Output" };

let _c = 0;
const uid = () => `n${++_c}`;

// ── Exercises ─────────────────────────────────────────────────────────────────
const BASE = {
  jss2:[
    { id:"j1", title:"Add Two Numbers",
      desc:"Read two numbers A and B, calculate their sum, and display the result.",
      hint:"Start → Input (A,B) → Process (Sum=A+B) → Output (Sum) → End",
      req:{terminal:2,io:2,process:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input A, B"},{type:"process",text:"Sum = A + B"},{type:"io",text:"Display Sum"},{type:"terminal",text:"End"}] },
    { id:"j2", title:"Even or Odd",
      desc:"Read a number N and determine whether it is Even or Odd.",
      hint:"Decision: N mod 2 = 0? Yes → Even, No → Odd",
      req:{terminal:2,io:3,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input N"},{type:"decision",text:"N mod 2 = 0?"},{type:"io",text:'Print "Even"'},{type:"io",text:'Print "Odd"'},{type:"terminal",text:"End"}] },
    { id:"j3", title:"Largest of Two Numbers",
      desc:"Read two numbers A and B and display the larger one.",
      hint:"Decision: A > B? Yes → Display A, No → Display B",
      req:{terminal:2,io:3,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input A, B"},{type:"decision",text:"A > B?"},{type:"io",text:"Display A"},{type:"io",text:"Display B"},{type:"terminal",text:"End"}] },
    { id:"j4", title:"Grade a Score",
      desc:"Read a score (0–100) and display grade: A (70+), B (60–69), C (50–59), F (below 50).",
      hint:"Chain three Decision diamonds, one per grade boundary.",
      req:{terminal:2,io:5,decision:3},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input Score"},{type:"decision",text:"Score ≥ 70?"},{type:"decision",text:"Score ≥ 60?"},{type:"decision",text:"Score ≥ 50?"},{type:"io",text:"Grade = A"},{type:"io",text:"Grade = B"},{type:"io",text:"Grade = C"},{type:"io",text:"Grade = F"},{type:"terminal",text:"End"}] },
    { id:"j5", title:"Simple Calculator",
      desc:"Read two numbers and an operator (+,−,×,÷), perform the operation, and display the result.",
      hint:"Use chained Decisions to check the operator, then a Process for each operation.",
      req:{terminal:2,io:2,process:4,decision:3},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input A, B, Op"},{type:"decision",text:"Op = '+'"},{type:"decision",text:"Op = '-'"},{type:"decision",text:"Op = '×'"},{type:"process",text:"Result=A+B"},{type:"process",text:"Result=A-B"},{type:"process",text:"Result=A×B"},{type:"process",text:"Result=A÷B"},{type:"io",text:"Display Result"},{type:"terminal",text:"End"}] },
    { id:"j6", title:"Positive, Negative or Zero",
      desc:"Read a number and determine whether it is Positive, Negative, or Zero.",
      hint:"First check N>0, if not check N<0, else it is Zero.",
      req:{terminal:2,io:4,decision:2},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input N"},{type:"decision",text:"N > 0?"},{type:"decision",text:"N < 0?"},{type:"io",text:'Print "Positive"'},{type:"io",text:'Print "Negative"'},{type:"io",text:'Print "Zero"'},{type:"terminal",text:"End"}] },
  ],
  ss2:[
    { id:"s1", title:"Count 1 to 10",
      desc:"Use a counting loop to display numbers from 1 to 10.",
      hint:"Set N=1, display N, increment N, loop until N>10.",
      req:{terminal:2,process:2,io:1,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"process",text:"N = 1"},{type:"io",text:"Display N"},{type:"process",text:"N = N + 1"},{type:"decision",text:"N > 10?"},{type:"terminal",text:"End"}] },
    { id:"s2", title:"Factorial of N",
      desc:"Read a positive number N and calculate N! (factorial).",
      hint:"Initialise F=1, I=1. Loop: F=F×I, I=I+1. Stop when I>N.",
      req:{terminal:2,io:2,process:3,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input N"},{type:"process",text:"F=1, I=1"},{type:"decision",text:"I > N?"},{type:"process",text:"F = F × I"},{type:"process",text:"I = I + 1"},{type:"io",text:"Display F"},{type:"terminal",text:"End"}] },
    { id:"s3", title:"Average of 5 Numbers",
      desc:"Use a loop to read 5 numbers and calculate their average.",
      hint:"Initialise Sum=0, I=1. Loop 5 times: read Num, add to Sum, increment I.",
      req:{terminal:2,io:2,process:4,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"process",text:"Sum=0, I=1"},{type:"io",text:"Input Num"},{type:"process",text:"Sum=Sum+Num"},{type:"process",text:"I=I+1"},{type:"decision",text:"I > 5?"},{type:"process",text:"Avg=Sum÷5"},{type:"io",text:"Display Avg"},{type:"terminal",text:"End"}] },
    { id:"s4", title:"Find Largest in 5 Numbers",
      desc:"Read 5 numbers one by one and display the largest.",
      hint:"Initialise Max with first number. Compare each new number; update Max if larger.",
      req:{terminal:2,io:3,process:3,decision:2},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input Max"},{type:"process",text:"I = 2"},{type:"io",text:"Input Num"},{type:"decision",text:"Num > Max?"},{type:"process",text:"Max = Num"},{type:"process",text:"I = I + 1"},{type:"decision",text:"I > 5?"},{type:"io",text:"Display Max"},{type:"terminal",text:"End"}] },
    { id:"s5", title:"Sum of N Numbers",
      desc:"Read a number N, then read N numbers and calculate their total sum.",
      hint:"Read N first. Loop N times: read each number and add to Sum.",
      req:{terminal:2,io:3,process:3,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input N"},{type:"process",text:"Sum=0, I=1"},{type:"decision",text:"I > N?"},{type:"io",text:"Input Num"},{type:"process",text:"Sum=Sum+Num"},{type:"process",text:"I=I+1"},{type:"io",text:"Display Sum"},{type:"terminal",text:"End"}] },
    { id:"s6", title:"Multiplication Table",
      desc:"Read a number N and print its multiplication table from 1 to 10.",
      hint:"Loop from I=1 to 10. Each iteration: Result=N×I, display it.",
      req:{terminal:2,io:2,process:3,decision:1},
      steps:[{type:"terminal",text:"Start"},{type:"io",text:"Input N"},{type:"process",text:"I = 1"},{type:"decision",text:"I > 10?"},{type:"process",text:"Result=N×I"},{type:"io",text:"Display Result"},{type:"process",text:"I=I+1"},{type:"terminal",text:"End"}] },
  ],
};

// ── Correction tips ───────────────────────────────────────────────────────────
function getTips(nodes, conns, ch) {
  if (!nodes.length) return [{ sev:"error", icon:"📋", title:"Canvas is empty",
    msg:"Start by dragging (or tapping) shapes from the left panel. Begin with a Start terminal." }];
  const cnt = {};
  nodes.forEach(n => { cnt[n.type]=(cnt[n.type]||0)+1; });
  const tips = [];
  if ((cnt.terminal||0)<2) tips.push({ sev:"error", icon:"🔴", title:"Missing Start/End terminals",
    msg:`Every flowchart needs a START and END terminal. You have ${cnt.terminal||0} — drag ${2-(cnt.terminal||0)} more.` });
  const help = {
    process:"Process boxes (rectangles) handle calculations and assignments like Sum=A+B or N=N+1.",
    decision:"Decision diamonds ask a Yes/No question and split the flow into TWO paths.",
    io:"Input/Output parallelograms READ data from the user or DISPLAY/PRINT a result.",
    terminal:"Terminals (rounded rectangles) mark the START and END of your flowchart.",
  };
  Object.entries(ch.req).forEach(([type,need]) => {
    const have = cnt[type]||0;
    if (have<need) tips.push({ sev:"error", icon:"⚠️",
      title:`Need ${need-have} more "${SYM[type].label}" shape${need-have>1?"s":""}`,
      msg: help[type] });
  });
  const out={}, inc={};
  conns.forEach(c=>{ out[c.from]=(out[c.from]||0)+1; inc[c.to]=(inc[c.to]||0)+1; });
  const isolated = nodes.filter(n=>!out[n.id]&&!inc[n.id]);
  if (isolated.length) tips.push({ sev:"error", icon:"🔗",
    title:`${isolated.length} unconnected shape${isolated.length>1?"s":""}`,
    msg:"Switch to 🔗 Connect mode, tap the source shape first (it glows orange), then tap the destination." });
  nodes.filter(n=>n.type==="decision").forEach(d=>{
    if ((out[d.id]||0)<2) tips.push({ sev:"tip", icon:"💡",
      title:`"${d.text}" needs 2 outgoing arrows`,
      msg:`A Decision diamond must have TWO arrows out — one YES and one NO. It has ${out[d.id]||0}.` });
  });
  if (!tips.length) tips.push({ sev:"ok", icon:"✅", title:"Looking good!",
    msg:"Shape counts and connections are correct. Your flowchart looks well structured!" });
  return tips;
}

// ── Shape SVG ─────────────────────────────────────────────────────────────────
function Shape({ type, text, w, h, selected }) {
  const s=SYM[type], sc=selected?"#f97316":s.stroke, sw=selected?2.5:1.5;
  const fs=!text?11:text.length>18?8:text.length>13?9:text.length>9?10:11;
  const lbl=<text x={w/2} y={h/2} textAnchor="middle" dominantBaseline="middle"
    fontSize={fs} fontWeight="700" fill={s.text} style={{pointerEvents:"none",userSelect:"none"}}>{text}</text>;
  if (type==="terminal") return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
    <rect x="2" y="2" width={w-4} height={h-4} rx={h/2-2} fill={s.fill} stroke={sc} strokeWidth={sw}/>{lbl}</svg>;
  if (type==="process") return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
    <rect x="2" y="2" width={w-4} height={h-4} fill={s.fill} stroke={sc} strokeWidth={sw}/>{lbl}</svg>;
  if (type==="decision") { const mx=w/2,my=h/2; return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
    <polygon points={`${mx},2 ${w-2},${my} ${mx},${h-2} 2,${my}`} fill={s.fill} stroke={sc} strokeWidth={sw}/>{lbl}</svg>; }
  const sk=16; return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
    <polygon points={`${sk},2 ${w-2},2 ${w-2-sk},${h-2} 2,${h-2}`} fill={s.fill} stroke={sc} strokeWidth={sw}/>{lbl}</svg>;
}

// ── Palette item (desktop drag + mobile tap-to-place) ─────────────────────────
function PaletteItem({ type, onDragStart, onTap }) {
  const [hov,setHov]=useState(false);
  return (
    <div draggable
      onDragStart={e=>onDragStart(e,type)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      onClick={()=>onTap(type)}
      style={{marginBottom:7,cursor:"pointer",opacity:hov?1:.85,
              transform:hov?"translateX(3px)":"none",transition:"all .15s",
              WebkitTapHighlightColor:"transparent"}}>
      <Shape type={type} text={SYM[type].label} w={W(type)} h={H(type)}/>
    </div>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing({ onStudent, onTeacher }) {
  return <div style={{height:"100vh",background:"#060d1a",display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"0 20px"}}>
    <div style={{textAlign:"center",marginBottom:40}}>
      <div style={{fontSize:52,marginBottom:10}}>📊</div>
      <h1 style={{fontSize:28,fontWeight:900,color:"#38bdf8",margin:0,letterSpacing:-1}}>FlowBuilder</h1>
      <p style={{color:"#2a4a70",fontSize:13,marginTop:7}}>Interactive Flowchart Practice · Computer Studies</p>
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"}}>
      <button onClick={onStudent} style={{padding:"13px 32px",borderRadius:12,border:"none",cursor:"pointer",
        background:"#0c4a6e",color:"#7dd3fc",fontSize:14,fontWeight:800,fontFamily:"inherit",
        boxShadow:"0 0 24px #0c4a6e55",WebkitTapHighlightColor:"transparent"}}>👨‍🎓 I'm a Student</button>
      <button onClick={onTeacher} style={{padding:"13px 32px",borderRadius:12,
        border:"1.5px solid #1e3a5f",cursor:"pointer",background:"transparent",
        color:"#475569",fontSize:14,fontWeight:800,fontFamily:"inherit",WebkitTapHighlightColor:"transparent"}}>👩‍🏫 Teacher Login</button>
    </div>
  </div>;
}

// ── Student Auth ──────────────────────────────────────────────────────────────
function StudentAuth({ onLogin, onBack }) {
  const [tab,setTab]=useState("login");
  const [name,setName]=useState("");
  const [level,setLevel]=useState("jss2");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const BG="#060d1a",PANEL="#0c1628",BORDER="#1e3a5f";
  const inp={width:"100%",padding:"9px 12px",borderRadius:7,border:`1px solid ${BORDER}`,
    background:"#0a1628",color:"#e2e8f0",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};

  const go=async()=>{
    const t=name.trim(); if(!t){setErr("Please enter your name.");return;}
    setLoading(true); setErr("");
    if(tab==="login"){
      const {data}=await db.from("users").select("*").ilike("name",t).eq("level",level);
      if(!data||data.length===0){setErr("Not found. Check name & class, or register first.");setLoading(false);return;}
      const u=data[0];
      const {data:prog}=await db.from("progress").select("*").eq("user_id",u.id);
      const progress=Object.fromEntries((prog||[]).map(p=>[p.exercise_id,
        {completed:p.completed,attempts:p.attempts,lastAttempt:p.last_attempt,completedAt:p.completed_at}]));
      onLogin({...u,createdAt:u.created_at,progress});
    } else {
      const {data:existing}=await db.from("users").select("id").ilike("name",t).eq("level",level);
      if(existing&&existing.length>0){setErr("Name already registered in this class. Try logging in.");setLoading(false);return;}
      const newUser={id:`u${Date.now()}`,name:t,level,createdAt:Date.now(),progress:{}};
      const ok=await dbRegisterUser(newUser);
      if(!ok){setErr("Registration failed. Please try again.");setLoading(false);return;}
      onLogin(newUser);
    }
    setLoading(false);
  };

  return <div style={{height:"100vh",background:BG,display:"flex",alignItems:"center",
    justifyContent:"center",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"0 16px"}}>
    <div style={{background:PANEL,borderRadius:14,border:`1px solid ${BORDER}`,padding:"28px 28px",width:"100%",maxWidth:340}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",
        fontSize:12,marginBottom:14,padding:0,fontFamily:"inherit"}}>← Back</button>
      <h2 style={{margin:"0 0 16px",fontSize:18,fontWeight:800,color:"#38bdf8"}}>Student Portal</h2>
      <div style={{display:"flex",marginBottom:16,background:"#0a1628",borderRadius:8,padding:3}}>
        {["login","register"].map(t=><button key={t} onClick={()=>{setTab(t);setErr("");}}
          style={{flex:1,padding:"6px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",
            fontSize:12,fontWeight:700,background:tab===t?"#0c4a6e":"transparent",
            color:tab===t?"#7dd3fc":"#475569"}}>{t==="login"?"Log In":"Register"}</button>)}
      </div>
      <div style={{marginBottom:11}}>
        <label style={{fontSize:11,color:"#475569",display:"block",marginBottom:4}}>Your Name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your full name"
          style={inp} onKeyDown={e=>e.key==="Enter"&&go()}/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={{fontSize:11,color:"#475569",display:"block",marginBottom:4}}>Your Class</label>
        <div style={{display:"flex",gap:8}}>
          {["jss2","ss2"].map(l=><button key={l} onClick={()=>setLevel(l)}
            style={{flex:1,padding:"8px",borderRadius:7,border:`1.5px solid ${level===l?"#38bdf8":BORDER}`,
              background:level===l?"#0c4a6e":"transparent",color:level===l?"#38bdf8":"#475569",
              fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{l.toUpperCase()}</button>)}
        </div>
      </div>
      {err&&<div style={{fontSize:11,color:"#f87171",marginBottom:11,background:"#1a0505",
        padding:"6px 10px",borderRadius:6}}>{err}</div>}
      <button onClick={go} disabled={loading} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",cursor:"pointer",
        background:loading?"#1e3a5f":"#0284c7",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>
        {loading?"Please wait…":tab==="login"?"Log In →":"Create Account →"}</button>
    </div>
  </div>;
}

// ── Teacher Auth ──────────────────────────────────────────────────────────────
function TeacherAuth({ onLogin, onBack }) {
  const [pass,setPass]=useState(""); const [err,setErr]=useState("");
  const BG="#060d1a",PANEL="#0c1628",BORDER="#1e3a5f";
  const inp={width:"100%",padding:"9px 12px",borderRadius:7,border:`1px solid ${BORDER}`,
    background:"#0a1628",color:"#e2e8f0",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  return <div style={{height:"100vh",background:BG,display:"flex",alignItems:"center",
    justifyContent:"center",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"0 16px"}}>
    <div style={{background:PANEL,borderRadius:14,border:`1px solid ${BORDER}`,padding:"28px 28px",width:"100%",maxWidth:320}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",
        fontSize:12,marginBottom:14,padding:0,fontFamily:"inherit"}}>← Back</button>
      <h2 style={{margin:"0 0 16px",fontSize:18,fontWeight:800,color:"#38bdf8"}}>Teacher Login</h2>
      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,color:"#475569",display:"block",marginBottom:4}}>Password</label>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
          placeholder="Enter teacher password" style={inp} onKeyDown={e=>e.key==="Enter"&&(pass===TEACHER_PASS?onLogin():setErr("Incorrect password."))}/>
      </div>
      {err&&<div style={{fontSize:11,color:"#f87171",marginBottom:11}}>{err}</div>}
      <button onClick={()=>pass===TEACHER_PASS?onLogin():setErr("Incorrect password.")}
        style={{width:"100%",padding:"10px",borderRadius:8,border:"none",cursor:"pointer",
          background:"#0284c7",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>Enter Dashboard →</button>
    </div>
  </div>;
}

// ── Teacher Dashboard ─────────────────────────────────────────────────────────
function TeacherDashboard({ onLogout, baseEx }) {
  const [tab,setTab]=useState("students");
  const [filterLvl,setFilterLvl]=useState("all");
  const [users,setUsers]=useState([]);
  const [customEx,setCustomEx]=useState({jss2:[],ss2:[]});
  const [loading,setLoading]=useState(true);
  const [addLvl,setAddLvl]=useState("jss2");
  const [form,setForm]=useState({title:"",desc:"",hint:"",steps:[]});
  const [newStep,setNewStep]=useState({type:"terminal",text:""});
  const [msg,setMsg]=useState("");
  const BG="#060d1a",PANEL="#0c1628",BORDER="#1e3a5f",MUTED="#2a4a70";
  const inp={width:"100%",padding:"7px 10px",borderRadius:6,border:`1px solid ${BORDER}`,
    background:"#0a1628",color:"#e2e8f0",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};

  useEffect(()=>{
    (async()=>{
      const [u,ex]=await Promise.all([dbLoadUsers(),dbLoadCustomEx()]);
      setUsers(u); setCustomEx(ex); setLoading(false);
    })();
  },[]);

  const allEx=lvl=>[...(baseEx[lvl]||[]),...(customEx[lvl]||[])];
  const getProg=u=>{
    const exs=allEx(u.level);
    const done=exs.filter(e=>u.progress?.[e.id]?.completed).length;
    return {done,total:exs.length,pct:exs.length?Math.round(done/exs.length*100):0};
  };
  const filtered=filterLvl==="all"?users:users.filter(u=>u.level===filterLvl);

  const addStep=()=>{
    if(!newStep.text.trim()) return;
    setForm(f=>({...f,steps:[...f.steps,{...newStep}]}));
    setNewStep({type:"terminal",text:""});
  };
  const submit=async()=>{
    if(!form.title.trim()||!form.desc.trim()||form.steps.length<2){setMsg("error");return;}
    const req={};
    form.steps.forEach(s=>{req[s.type]=(req[s.type]||0)+1;});
    const ex={id:`c${Date.now()}`,title:form.title.trim(),desc:form.desc.trim(),
      hint:form.hint.trim(),steps:form.steps,req};
    await dbAddCustomEx(addLvl,ex);
    setCustomEx(prev=>({...prev,[addLvl]:[...(prev[addLvl]||[]),ex]}));
    setForm({title:"",desc:"",hint:"",steps:[]});
    setMsg("ok"); setTimeout(()=>setMsg(""),3000);
  };
  const handleDelete=async(lvl,id)=>{
    await dbDeleteCustomEx(id);
    setCustomEx(prev=>({...prev,[lvl]:prev[lvl].filter(e=>e.id!==id)}));
  };

  const TabBtn=({id,label})=><button onClick={()=>setTab(id)}
    style={{padding:"5px 13px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
      fontFamily:"inherit",background:tab===id?"#0c4a6e":"transparent",color:tab===id?"#7dd3fc":"#475569"}}>{label}</button>;

  return <div style={{height:"100vh",background:BG,color:"#e2e8f0",
    fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
    <header style={{background:PANEL,borderBottom:`1px solid ${BORDER}`,height:48,
      display:"flex",alignItems:"center",padding:"0 14px",gap:8,flexShrink:0,flexWrap:"wrap"}}>
      <span style={{fontSize:14,fontWeight:800,color:"#38bdf8"}}>FlowBuilder</span>
      <span style={{fontSize:10,color:MUTED,background:"#0c2540",padding:"2px 7px",borderRadius:10,fontWeight:700}}>Teacher</span>
      <div style={{display:"flex",gap:3,marginLeft:6,flexWrap:"wrap"}}>
        <TabBtn id="students" label="👥 Students"/>
        <TabBtn id="exercises" label="📚 Exercises"/>
        <TabBtn id="add" label="➕ Add Exercise"/>
      </div>
      <button onClick={onLogout} style={{marginLeft:"auto",padding:"3px 10px",borderRadius:5,
        border:`1px solid ${BORDER}`,background:"transparent",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Log out</button>
    </header>

    <div style={{flex:1,overflow:"auto",padding:"16px 18px"}}>
      {loading&&<div style={{color:MUTED,textAlign:"center",padding:"40px 0",fontSize:13}}>Loading students…</div>}

      {/* Students */}
      {!loading&&tab==="students"&&<div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:13,flexWrap:"wrap"}}>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:"#f1f5f9"}}>Students ({filtered.length})</h2>
          <div style={{display:"flex",gap:4}}>
            {["all","jss2","ss2"].map(l=><button key={l} onClick={()=>setFilterLvl(l)}
              style={{padding:"2px 10px",borderRadius:10,border:`1px solid ${filterLvl===l?"#38bdf8":BORDER}`,
                background:filterLvl===l?"#0c4a6e":"transparent",color:filterLvl===l?"#38bdf8":"#475569",
                fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {l==="all"?"All":l.toUpperCase()}</button>)}
          </div>
        </div>
        {filtered.length===0
          ? <div style={{color:MUTED,fontSize:13,textAlign:"center",padding:"40px 0"}}>No students registered yet.</div>
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:9}}>
            {filtered.map(u=>{
              const p=getProg(u);
              const exs=allEx(u.level);
              return <div key={u.id} style={{background:PANEL,borderRadius:10,border:`1px solid ${BORDER}`,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"#0c4a6e",display:"flex",
                    alignItems:"center",justifyContent:"center",fontSize:12,color:"#7dd3fc",fontWeight:800,flexShrink:0}}>
                    {u.name[0].toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                    <div style={{fontSize:10,color:MUTED,fontWeight:600}}>{u.level.toUpperCase()}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:800,color:p.pct===100?"#4ade80":p.pct>50?"#fbbf24":"#60a5fa",flexShrink:0}}>{p.pct}%</div>
                </div>
                <div style={{height:5,background:"#1e3a5f",borderRadius:3,overflow:"hidden",marginBottom:6}}>
                  <div style={{width:`${p.pct}%`,height:"100%",borderRadius:3,
                    background:p.pct===100?"#34d399":p.pct>50?"#fbbf24":"#60a5fa",transition:"width .5s"}}/></div>
                <div style={{fontSize:10,color:MUTED,marginBottom:7}}>{p.done} / {p.total} completed</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {exs.map(ex=>{
                    const done=u.progress?.[ex.id]?.completed;
                    const att=u.progress?.[ex.id]?.attempts||0;
                    return <div key={ex.id} title={`${ex.title}${att?" · "+att+" attempt(s)":""}`}
                      style={{fontSize:9,padding:"2px 5px",borderRadius:5,fontWeight:700,
                        background:done?"#052e16":"#0a1628",color:done?"#4ade80":"#1e3a5f",
                        border:`1px solid ${done?"#16a34a":"#172333"}`}}>
                      {done?"✓ ":""}{ex.title.length>11?ex.title.slice(0,9)+"…":ex.title}</div>;
                  })}
                </div>
              </div>;
            })}
          </div>}
      </div>}

      {/* Exercises */}
      {!loading&&tab==="exercises"&&<div>
        <h2 style={{margin:"0 0 13px",fontSize:14,fontWeight:800,color:"#f1f5f9"}}>All Exercises</h2>
        {["jss2","ss2"].map(lvl=><div key={lvl} style={{marginBottom:20}}>
          <h3 style={{margin:"0 0 7px",fontSize:11,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:1}}>{lvl.toUpperCase()}</h3>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {allEx(lvl).map((ex,i)=>{
              const isCustom=!baseEx[lvl].find(b=>b.id===ex.id);
              return <div key={ex.id} style={{display:"flex",alignItems:"center",gap:8,
                background:PANEL,borderRadius:7,padding:"8px 12px",border:`1px solid ${BORDER}`}}>
                <span style={{fontSize:10,color:MUTED,minWidth:16}}>{i+1}.</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>{ex.title}</div>
                  <div style={{fontSize:10,color:"#475569",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ex.desc}</div>
                </div>
                {isCustom&&<>
                  <span style={{fontSize:9,background:"#1e1b4b",color:"#a5b4fc",padding:"2px 5px",borderRadius:5,fontWeight:700,flexShrink:0}}>Custom</span>
                  <button onClick={()=>handleDelete(lvl,ex.id)} style={{padding:"2px 7px",borderRadius:4,border:"none",
                    cursor:"pointer",background:"#3f0707",color:"#f87171",fontSize:10,fontWeight:700,fontFamily:"inherit",flexShrink:0}}>Delete</button>
                </>}
              </div>;
            })}
          </div>
        </div>)}
      </div>}

      {/* Add Exercise */}
      {!loading&&tab==="add"&&<div style={{maxWidth:560}}>
        <h2 style={{margin:"0 0 13px",fontSize:14,fontWeight:800,color:"#f1f5f9"}}>Add New Exercise</h2>
        <div style={{display:"flex",gap:6,marginBottom:13}}>
          {["jss2","ss2"].map(l=><button key={l} onClick={()=>setAddLvl(l)}
            style={{padding:"5px 16px",borderRadius:7,border:`1.5px solid ${addLvl===l?"#38bdf8":BORDER}`,
              background:addLvl===l?"#0c4a6e":"transparent",color:addLvl===l?"#38bdf8":"#475569",
              fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{l.toUpperCase()}</button>)}
        </div>
        {[["Title *","title","e.g. Swap Two Variables"],["Description *","desc","What the student needs to do"],["Hint (optional)","hint","A helpful clue"]].map(([label,key,ph])=>(
          <div key={key} style={{marginBottom:9}}>
            <label style={{fontSize:11,color:"#475569",display:"block",marginBottom:3}}>{label}</label>
            {key==="desc"
              ? <textarea value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                  placeholder={ph} rows={2} style={{...inp,resize:"vertical"}}/>
              : <input value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph} style={inp}/>}
          </div>
        ))}
        <div style={{marginBottom:11}}>
          <label style={{fontSize:11,color:"#475569",display:"block",marginBottom:5}}>Solution Steps * (add in order)</label>
          <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
            <select value={newStep.type} onChange={e=>setNewStep(s=>({...s,type:e.target.value}))} style={{...inp,width:130}}>
              {SYM_ORDER.map(t=><option key={t} value={t}>{SYM[t].label}</option>)}
            </select>
            <input value={newStep.text} onChange={e=>setNewStep(s=>({...s,text:e.target.value}))}
              placeholder="Step label" style={{...inp,flex:1,minWidth:100}} onKeyDown={e=>e.key==="Enter"&&addStep()}/>
            <button onClick={addStep} style={{padding:"7px 11px",borderRadius:5,border:"none",cursor:"pointer",
              background:"#0369a1",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>+ Add</button>
          </div>
          {form.steps.length>0&&<div style={{background:"#0a1628",borderRadius:7,padding:"6px 8px",
            border:`1px solid ${BORDER}`,maxHeight:160,overflowY:"auto"}}>
            {form.steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",
              borderBottom:i<form.steps.length-1?"1px solid #1e293b":"none"}}>
              <span style={{fontSize:10,color:MUTED,minWidth:14}}>{i+1}.</span>
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,fontWeight:700,
                background:`${SYM[s.type].fill}22`,color:SYM[s.type].fill}}>{SYM[s.type].label}</span>
              <span style={{fontSize:11,color:"#94a3b8",flex:1}}>{s.text}</span>
              <button onClick={()=>setForm(f=>({...f,steps:f.steps.filter((_,j)=>j!==i)}))}
                style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:0}}>✕</button>
            </div>)}
          </div>}
        </div>
        {msg==="error"&&<div style={{fontSize:11,color:"#f87171",marginBottom:9,background:"#1a0505",padding:"6px 10px",borderRadius:6}}>Fill in Title, Description and at least 2 steps.</div>}
        {msg==="ok"&&<div style={{fontSize:11,color:"#4ade80",marginBottom:9,background:"#052e16",padding:"6px 10px",borderRadius:6}}>✓ Exercise added successfully!</div>}
        <button onClick={submit} style={{padding:"9px 20px",borderRadius:7,border:"none",cursor:"pointer",
          background:"#15803d",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>Save Exercise →</button>
      </div>}
    </div>
  </div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState("landing");
  const [customEx,setCustomEx]=useState({jss2:[],ss2:[]});
  const [loaded,setLoaded]=useState(false);
  const [currentUser,setCurrentUser]=useState(null);

  // Builder state
  const [cIdx,setCIdx]=useState(0);
  const [nodes,setNodes]=useState([]);
  const [conns,setConns]=useState([]);
  const [history,setHistory]=useState([{nodes:[],conns:[]}]);
  const [histIdx,setHistIdx]=useState(0);
  const [mode,setMode]=useState("move");
  const [selNode,setSelNode]=useState(null);
  const [cfrom,setCfrom]=useState(null);
  const [editing,setEditing]=useState(null);
  const [editTxt,setEditTxt]=useState("");
  const [feedback,setFeedback]=useState(null);
  const [showTips,setShowTips]=useState(false);
  const [tips,setTips]=useState([]);
  // Mobile tap-to-place
  const [tapType,setTapType]=useState(null);

  const canvasRef=useRef(null);
  const dragType=useRef(null);
  const dragNode=useRef(null);
  const didMove=useRef(false);

  useEffect(()=>{
    dbLoadCustomEx().then(ex=>{setCustomEx(ex);setLoaded(true);});
  },[]);

  const allEx=useCallback(lvl=>[...BASE[lvl],...(customEx[lvl]||[])],[customEx]);
  const ch=currentUser?allEx(currentUser.level)[cIdx]:null;

  useEffect(()=>{
    setNodes([]); setConns([]);
    setHistory([{nodes:[],conns:[]}]); setHistIdx(0);
    setSelNode(null); setCfrom(null); setTapType(null);
    setFeedback(null); setShowTips(false);
    setEditing(null); setMode("move");
  },[cIdx, currentUser?.id]);

  const pushHist=useCallback((nn,nc)=>{
    setHistory(h=>[...h.slice(0,histIdx+1),{nodes:nn,conns:nc}].slice(-MAX_HIST));
    setHistIdx(i=>Math.min(i+1,MAX_HIST-1));
  },[histIdx]);

  const undo=useCallback(()=>{
    if(histIdx<=0) return;
    const p=history[histIdx-1];
    setNodes(p.nodes); setConns(p.conns); setHistIdx(i=>i-1);
  },[history,histIdx]);

  const redo=useCallback(()=>{
    if(histIdx>=history.length-1) return;
    const n=history[histIdx+1];
    setNodes(n.nodes); setConns(n.conns); setHistIdx(i=>i+1);
  },[history,histIdx]);

  useEffect(()=>{
    const k=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==="z"){e.preventDefault();undo();}
      if((e.ctrlKey||e.metaKey)&&e.key==="y"){e.preventDefault();redo();}
    };
    window.addEventListener("keydown",k);
    return ()=>window.removeEventListener("keydown",k);
  },[undo,redo]);

  const saveProgress=useCallback(async(userId,exId,isComplete)=>{
    setCurrentUser(prev=>{
      if(!prev||prev.id!==userId) return prev;
      const ex=prev.progress?.[exId]||{};
      const updated={...ex,attempts:(ex.attempts||0)+1,lastAttempt:Date.now(),
        ...(isComplete&&!ex.completed?{completed:true,completedAt:Date.now()}:{})};
      dbSaveProgress(userId,exId,updated);
      return {...prev,progress:{...prev.progress,[exId]:updated}};
    });
  },[]);

  // ── Desktop drag from palette ────────────────────────────────────────────
  const palDragStart=useCallback((e,type)=>{
    dragType.current=type; e.dataTransfer.effectAllowed="copy";
    setTapType(null);
  },[]);

  // ── Mobile tap-to-place ──────────────────────────────────────────────────
  const palTap=useCallback((type)=>{
    setTapType(p=>p===type?null:type);
  },[]);

  const placeOnCanvas=useCallback((clientX,clientY)=>{
    if(!tapType||!canvasRef.current) return false;
    const r=canvasRef.current.getBoundingClientRect();
    if(clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom) return false;
    const x=snap(Math.max(0,clientX-r.left-W(tapType)/2));
    const y=snap(Math.max(0,clientY-r.top-H(tapType)/2));
    const nn=[...nodes,{id:uid(),type:tapType,text:DEF_TEXT[tapType],x,y}];
    setNodes(nn); pushHist(nn,conns);
    setTapType(null);
    return true;
  },[tapType,nodes,conns,pushHist]);

  // ── Desktop drop ─────────────────────────────────────────────────────────
  const canvasDrop=useCallback(e=>{
    e.preventDefault();
    const type=dragType.current;
    if(!type||!canvasRef.current) return;
    const r=canvasRef.current.getBoundingClientRect();
    const x=snap(Math.max(0,e.clientX-r.left-W(type)/2));
    const y=snap(Math.max(0,e.clientY-r.top-H(type)/2));
    const nn=[...nodes,{id:uid(),type,text:DEF_TEXT[type],x,y}];
    setNodes(nn); pushHist(nn,conns);
    dragType.current=null;
  },[nodes,conns,pushHist]);

  // ── Mouse drag (desktop node move) ───────────────────────────────────────
  const nodeMouseDown=useCallback((e,id)=>{
    if(mode!=="move") return;
    e.stopPropagation(); didMove.current=false;
    const nd=nodes.find(n=>n.id===id);
    if(!nd||!canvasRef.current) return;
    const r=canvasRef.current.getBoundingClientRect();
    dragNode.current={id,ox:e.clientX-r.left-nd.x,oy:e.clientY-r.top-nd.y};
    setSelNode(id);
  },[mode,nodes]);

  const canvasMouseMove=useCallback(e=>{
    if(!dragNode.current||!canvasRef.current) return;
    didMove.current=true;
    const r=canvasRef.current.getBoundingClientRect();
    const x=Math.max(0,e.clientX-r.left-dragNode.current.ox);
    const y=Math.max(0,e.clientY-r.top-dragNode.current.oy);
    setNodes(ns=>ns.map(n=>n.id===dragNode.current.id?{...n,x,y}:n));
  },[]);

  const canvasMouseUp=useCallback(()=>{
    if(dragNode.current&&didMove.current){
      setNodes(ns=>{
        const sn=ns.map(n=>n.id===dragNode.current.id?{...n,x:snap(n.x),y:snap(n.y)}:n);
        pushHist(sn,conns); return sn;
      });
    }
    dragNode.current=null;
  },[conns,pushHist]);

  // ── Touch drag (mobile node move) ────────────────────────────────────────
  const nodeTouchStart=useCallback((e,id)=>{
    // If tap-to-place active, let the canvas tap handler deal with it
    if(tapType) return;
    if(mode!=="move") return;
    e.stopPropagation();
    const touch=e.touches[0];
    const nd=nodes.find(n=>n.id===id);
    if(!nd||!canvasRef.current) return;
    const r=canvasRef.current.getBoundingClientRect();
    dragNode.current={id,ox:touch.clientX-r.left-nd.x,oy:touch.clientY-r.top-nd.y};
    didMove.current=false;
    setSelNode(id);
  },[mode,nodes,tapType]);

  const canvasTouchMove=useCallback(e=>{
    if(!dragNode.current||!canvasRef.current) return;
    e.preventDefault();
    didMove.current=true;
    const touch=e.touches[0];
    const r=canvasRef.current.getBoundingClientRect();
    const x=Math.max(0,touch.clientX-r.left-dragNode.current.ox);
    const y=Math.max(0,touch.clientY-r.top-dragNode.current.oy);
    setNodes(ns=>ns.map(n=>n.id===dragNode.current.id?{...n,x,y}:n));
  },[]);

  const canvasTouchEnd=useCallback(e=>{
    // tap-to-place
    if(tapType){
      const touch=e.changedTouches[0];
      placeOnCanvas(touch.clientX,touch.clientY);
      return;
    }
    if(dragNode.current&&didMove.current){
      setNodes(ns=>{
        const sn=ns.map(n=>n.id===dragNode.current.id?{...n,x:snap(n.x),y:snap(n.y)}:n);
        pushHist(sn,conns); return sn;
      });
    }
    dragNode.current=null;
  },[tapType,placeOnCanvas,conns,pushHist]);

  // ── Click handlers ───────────────────────────────────────────────────────
  const nodeClick=useCallback((e,id)=>{
    e.stopPropagation();
    if(didMove.current){didMove.current=false;return;}
    // tap-to-place: clicking a node while placing — ignore, don't place on top
    if(tapType) return;
    if(mode==="delete"){
      const nn=nodes.filter(n=>n.id!==id);
      const nc=conns.filter(c=>c.from!==id&&c.to!==id);
      setNodes(nn); setConns(nc); pushHist(nn,nc);
      if(selNode===id) setSelNode(null); return;
    }
    if(mode==="connect"){
      if(!cfrom){setCfrom(id);}
      else if(cfrom===id){setCfrom(null);}
      else{
        if(!conns.some(c=>c.from===cfrom&&c.to===id)){
          const nc=[...conns,{from:cfrom,to:id}];
          setConns(nc); pushHist(nodes,nc);
        }
        setCfrom(null);
      }
      return;
    }
    setSelNode(p=>p===id?null:id);
  },[mode,cfrom,conns,nodes,selNode,tapType,pushHist]);

  const canvasClick=useCallback((e)=>{
    if(tapType){
      placeOnCanvas(e.clientX,e.clientY);
      return;
    }
    if(mode==="connect"){setCfrom(null);return;}
    setSelNode(null);
  },[mode,tapType,placeOnCanvas]);

  const nodeDbl=useCallback((e,id)=>{
    e.stopPropagation();
    if(mode!=="move") return;
    const nd=nodes.find(n=>n.id===id);
    if(!nd) return;
    setEditing(id); setEditTxt(nd.text);
  },[mode,nodes]);

  const commitEdit=useCallback(()=>{
    if(!editing) return;
    setNodes(ns=>{
      const u=ns.map(n=>n.id===editing?{...n,text:editTxt.trim()||n.text}:n);
      pushHist(u,conns); return u;
    });
    setEditing(null);
  },[editing,editTxt,conns,pushHist]);

  const deleteConn=useCallback((from,to)=>{
    const nc=conns.filter(c=>!(c.from===from&&c.to===to));
    setConns(nc); pushHist(nodes,nc);
  },[conns,nodes,pushHist]);

  const getPath=useCallback((from,to)=>{
    const a=nodes.find(n=>n.id===from),b=nodes.find(n=>n.id===to);
    if(!a||!b) return null;
    const x1=a.x+W(a.type)/2,y1=a.y+H(a.type),x2=b.x+W(b.type)/2,y2=b.y,mid=(y1+y2)/2;
    return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;
  },[nodes]);

  const getMid=useCallback((from,to)=>{
    const a=nodes.find(n=>n.id===from),b=nodes.find(n=>n.id===to);
    if(!a||!b) return null;
    return {x:(a.x+W(a.type)/2+b.x+W(b.type)/2)/2,y:(a.y+H(a.type)+b.y)/2};
  },[nodes]);

  const checkFlowchart=useCallback(()=>{
    if(!ch||!currentUser) return;
    const t=getTips(nodes,conns,ch);
    setTips(t); setShowTips(true);
    const isOk=t.every(x=>x.sev!=="error");
    saveProgress(currentUser.id,ch.id,isOk);
    setFeedback(isOk
      ?{ok:true,msg:"✓ Excellent! Exercise marked as complete."}
      :{ok:false,msg:`Found ${t.filter(x=>x.sev==="error").length} issue(s) — see correction tips below ↓`});
  },[nodes,conns,ch,currentUser,saveProgress]);

  const BG="#060d1a",PANEL="#0c1628",BORDER="#1e3a5f",MUTED="#2a4a70";

  if(!loaded) return <div style={{height:"100vh",background:BG,display:"flex",alignItems:"center",
    justifyContent:"center",color:"#38bdf8",fontSize:15,fontFamily:"sans-serif"}}>Loading…</div>;

  if(screen==="landing")      return <Landing onStudent={()=>setScreen("studentAuth")} onTeacher={()=>setScreen("teacherAuth")}/>;
  if(screen==="studentAuth")  return <StudentAuth onLogin={u=>{setCurrentUser(u);setCIdx(0);setScreen("student");}} onBack={()=>setScreen("landing")}/>;
  if(screen==="teacherAuth")  return <TeacherAuth onLogin={()=>setScreen("teacher")} onBack={()=>setScreen("landing")}/>;
  if(screen==="teacher")      return <TeacherDashboard baseEx={BASE} onLogout={()=>setScreen("landing")}/>;

  // ── Student Builder ────────────────────────────────────────────────────────
  if(screen==="student"&&currentUser&&ch){
    const exList=allEx(currentUser.level);
    const progress=currentUser.progress||{};
    const completed=exList.filter(e=>progress[e.id]?.completed).length;
    const pct=Math.round(completed/exList.length*100);

    return <div style={{display:"flex",flexDirection:"column",height:"100vh",background:BG,
      color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui,sans-serif",overflow:"hidden",
      touchAction:"none"}}>

      {/* Header */}
      <header style={{background:PANEL,borderBottom:`1px solid ${BORDER}`,minHeight:46,
        display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:14,fontWeight:800,color:"#38bdf8"}}>FlowBuilder</span>
        <div style={{width:1,height:16,background:BORDER}}/>
        <span style={{fontSize:12,color:"#7dd3fc",fontWeight:700}}>{currentUser.name}</span>
        <span style={{fontSize:10,color:MUTED,background:"#0c3554",padding:"2px 7px",borderRadius:10,fontWeight:700}}>
          {currentUser.level.toUpperCase()}</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:10,color:MUTED,fontWeight:600}}>Progress:</span>
          <div style={{width:72,height:5,background:"#1e3a5f",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:"#34d399",borderRadius:3,transition:"width .5s"}}/></div>
          <span style={{fontSize:10,color:"#34d399",fontWeight:700}}>{pct}%</span>
          <span style={{fontSize:10,color:MUTED}}>{completed}/{exList.length}</span>
        </div>
        <button onClick={()=>{setCurrentUser(null);setScreen("landing");}} style={{marginLeft:"auto",
          padding:"3px 9px",borderRadius:5,border:`1px solid ${BORDER}`,background:"transparent",
          color:MUTED,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Log out</button>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        <aside style={{width:176,background:PANEL,borderRight:`1px solid ${BORDER}`,
          display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"9px 9px 7px",borderBottom:`1px solid ${BORDER}`}}>
            <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:1.1,marginBottom:6}}>
              {tapType?`Tap canvas to place ${SYM[tapType].label} ↓`:"Tap a symbol to place it"}</div>
            {tapType&&<div style={{fontSize:9,color:"#fbbf24",marginBottom:6,fontWeight:600}}>
              Tap again to cancel · Tap canvas to place</div>}
            {SYM_ORDER.map(type=>(
              <div key={type} style={{outline:tapType===type?`2px solid #f97316`:"none",borderRadius:4,marginBottom:7}}>
                <PaletteItem type={type} onDragStart={palDragStart} onTap={palTap}/>
              </div>
            ))}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 6px"}}>
            <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:1.1,marginBottom:6,padding:"0 3px"}}>
              {currentUser.level.toUpperCase()} Exercises</div>
            {exList.map((c,i)=>{
              const done=progress[c.id]?.completed;
              return <button key={c.id} onClick={()=>setCIdx(i)}
                style={{display:"flex",alignItems:"center",gap:5,width:"100%",textAlign:"left",
                  padding:"7px 8px",borderRadius:6,border:`1px solid ${cIdx===i?"#1d5f8a":"#172333"}`,
                  background:cIdx===i?"#0c3554":"transparent",
                  color:cIdx===i?"#7dd3fc":done?"#4ade80":"#4a6280",
                  fontSize:11,fontWeight:cIdx===i?700:500,cursor:"pointer",marginBottom:3,fontFamily:"inherit",
                  WebkitTapHighlightColor:"transparent"}}>
                <span style={{flex:1}}>{c.title}</span>
                {done&&<span>✅</span>}
              </button>;
            })}
          </div>
        </aside>

        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Challenge info */}
          <div style={{background:"#09141f",padding:"6px 13px",borderBottom:`1px solid ${BORDER}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:1}}>
              <span style={{fontWeight:800,fontSize:13,color:"#f1f5f9"}}>{ch.title}</span>
              {progress[ch.id]?.completed&&<span style={{fontSize:9,background:"#052e16",color:"#4ade80",
                padding:"1px 7px",borderRadius:9,fontWeight:700}}>✓ Completed</span>}
            </div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{ch.desc}</div>
            <div style={{fontSize:10,color:MUTED}}>💡 {ch.hint}</div>
          </div>

          {/* Toolbar */}
          <div style={{background:BG,padding:"5px 10px",display:"flex",gap:4,alignItems:"center",
            borderBottom:"1px solid #0f1f35",flexShrink:0,flexWrap:"wrap"}}>
            {[["move","✋","Move"],["connect","🔗","Connect"],["delete","✕","Delete"]].map(([m,icon,lbl])=>(
              <button key={m} onClick={()=>{setMode(m);setCfrom(null);setTapType(null);}}
                style={{padding:"4px 9px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",
                  WebkitTapHighlightColor:"transparent",
                  background:mode===m?(m==="delete"?"#7f1d1d":"#075985"):(m==="delete"?"#180a0a":"#172333"),
                  color:mode===m?(m==="delete"?"#fca5a5":"#fff"):(m==="delete"?"#ef4444":"#4a6280")}}>
                {icon} {lbl}</button>
            ))}
            <div style={{width:1,height:16,background:BORDER,margin:"0 1px"}}/>
            <button onClick={undo} disabled={histIdx<=0}
              style={{padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                fontFamily:"inherit",background:"#172333",color:histIdx<=0?"#2a3a4a":"#7dd3fc",
                opacity:histIdx<=0?.4:1,WebkitTapHighlightColor:"transparent"}}>↩</button>
            <button onClick={redo} disabled={histIdx>=history.length-1}
              style={{padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                fontFamily:"inherit",background:"#172333",color:histIdx>=history.length-1?"#2a3a4a":"#7dd3fc",
                opacity:histIdx>=history.length-1?.4:1,WebkitTapHighlightColor:"transparent"}}>↪</button>
            <button onClick={()=>{setNodes([]);setConns([]);setHistory([{nodes:[],conns:[]}]);setHistIdx(0);setFeedback(null);setShowTips(false);setTapType(null);}}
              style={{padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                fontFamily:"inherit",background:"#172333",color:"#4a6280",WebkitTapHighlightColor:"transparent"}}>🧹</button>
            <button onClick={checkFlowchart}
              style={{padding:"4px 12px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                fontFamily:"inherit",background:"#15803d",color:"#fff",WebkitTapHighlightColor:"transparent"}}>✓ Check</button>
            {mode==="connect"&&<span style={{fontSize:10,color:"#fbbf24",fontWeight:700}}>
              {cfrom?"→ Tap destination":"→ Tap source first"}</span>}
            {mode==="delete"&&<span style={{fontSize:10,color:"#f87171",fontWeight:700}}>→ Tap shape or × on arrow</span>}
          </div>

          {/* Feedback */}
          {feedback&&<div style={{padding:"6px 12px",flexShrink:0,fontSize:11,fontWeight:600,display:"flex",gap:7,
            background:feedback.ok?"#052e16":"#3f0707",color:feedback.ok?"#4ade80":"#fca5a5",
            borderBottom:`1px solid ${feedback.ok?"#16a34a":"#dc2626"}`}}>
            <span style={{flex:1}}>{feedback.msg}</span>
            <button onClick={()=>setFeedback(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:15,padding:0}}>×</button>
          </div>}

          {/* Correction tips */}
          {showTips&&tips.length>0&&<div style={{padding:"7px 12px",flexShrink:0,background:"#070f1e",
            borderBottom:`1px solid ${BORDER}`,maxHeight:170,overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:1}}>Correction Tips</span>
              <button onClick={()=>setShowTips(false)} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:14,padding:0}}>×</button>
            </div>
            {tips.map((tip,i)=><div key={i} style={{display:"flex",gap:7,marginBottom:5,padding:"6px 8px",borderRadius:6,
              background:tip.sev==="error"?"#180808":tip.sev==="ok"?"#062010":"#0d1a0a",
              border:`1px solid ${tip.sev==="error"?"#3f0707":tip.sev==="ok"?"#14532d":"#1a2e1a"}`}}>
              <span style={{fontSize:13,flexShrink:0}}>{tip.icon}</span>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:tip.sev==="error"?"#f87171":tip.sev==="ok"?"#4ade80":"#86efac"}}>{tip.title}</div>
                <div style={{fontSize:10,color:"#64748b",lineHeight:1.5}}>{tip.msg}</div>
              </div>
            </div>)}
          </div>}

          {/* Canvas */}
          <div style={{flex:1,overflow:"auto",WebkitOverflowScrolling:"touch"}}>
            <div ref={canvasRef}
              style={{position:"relative",minWidth:1100,minHeight:640,
                backgroundImage:"radial-gradient(circle, #1a2d4a 1.2px, transparent 1.2px)",
                backgroundSize:"28px 28px",backgroundPosition:"0 0",
                cursor:tapType?"crosshair":"default"}}
              onDrop={canvasDrop}
              onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";}}
              onClick={canvasClick}
              onMouseMove={canvasMouseMove}
              onMouseUp={canvasMouseUp}
              onMouseLeave={canvasMouseUp}
              onTouchMove={canvasTouchMove}
              onTouchEnd={canvasTouchEnd}>

              {/* Arrows */}
              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}}>
                <defs>
                  <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0,8 3,0 6" fill="#3d5a7a"/></marker>
                </defs>
                {conns.map(c=>{const p=getPath(c.from,c.to);return p?
                  <path key={`${c.from}-${c.to}`} d={p} fill="none" stroke="#3d5a7a" strokeWidth="2" markerEnd="url(#arr)"/>:null;})}
              </svg>

              {/* Delete-conn buttons */}
              {mode==="delete"&&conns.map(c=>{const mid=getMid(c.from,c.to);return mid?
                <button key={`dx-${c.from}-${c.to}`} onClick={()=>deleteConn(c.from,c.to)}
                  style={{position:"absolute",left:mid.x-11,top:mid.y-11,width:22,height:22,borderRadius:"50%",
                    border:"none",background:"#dc2626",color:"#fff",fontSize:13,fontWeight:800,
                    cursor:"pointer",zIndex:5,lineHeight:"22px",textAlign:"center",padding:0,
                    WebkitTapHighlightColor:"transparent"}}>×</button>:null;})}

              {/* Nodes */}
              {nodes.map(nd=><div key={nd.id}
                style={{position:"absolute",left:nd.x,top:nd.y,width:W(nd.type),height:H(nd.type),zIndex:2,
                  cursor:tapType?"crosshair":mode==="delete"?"not-allowed":mode==="connect"?"crosshair":"grab",
                  filter:(selNode===nd.id||cfrom===nd.id)
                    ?`drop-shadow(0 0 7px ${cfrom===nd.id?"#f97316":"#0ea5e9"})`:"none",
                  transition:"filter .1s",WebkitTapHighlightColor:"transparent",
                  touchAction:"none"}}
                onMouseDown={e=>nodeMouseDown(e,nd.id)}
                onTouchStart={e=>nodeTouchStart(e,nd.id)}
                onClick={e=>nodeClick(e,nd.id)}
                onDoubleClick={e=>nodeDbl(e,nd.id)}>
                <Shape type={nd.type} text={nd.text} w={W(nd.type)} h={H(nd.type)} selected={selNode===nd.id||cfrom===nd.id}/>
                {editing===nd.id&&<input autoFocus value={editTxt}
                  onChange={e=>setEditTxt(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")commitEdit();}}
                  onBlur={commitEdit}
                  style={{position:"absolute",inset:0,width:"100%",height:"100%",
                    background:"rgba(2,8,23,.93)",color:"#e2e8f0",border:"2px solid #38bdf8",borderRadius:4,
                    textAlign:"center",fontSize:11,fontWeight:700,fontFamily:"inherit",zIndex:20}}/>}
              </div>)}

              {/* Empty state */}
              {nodes.length===0&&<div style={{position:"absolute",inset:0,display:"flex",
                alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                <div style={{textAlign:"center",color:"#1a3050",padding:"0 20px"}}>
                  <div style={{fontSize:38,opacity:.5,marginBottom:10}}>📋</div>
                  <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Tap a symbol on the left, then tap here to place it</div>
                  <div style={{fontSize:11}}>On desktop: drag shapes onto the canvas</div>
                </div>
              </div>}
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  return null;
}
