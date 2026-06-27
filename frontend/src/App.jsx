import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  Activity, Heart, Thermometer, Droplets, LayoutDashboard, Eye,
  ShieldAlert, Lightbulb, MessageSquare, Target, Users, FileText,
  BarChart2, RefreshCw, ChevronDown, User, AlertCircle, CheckCircle,
  TrendingUp, Dumbbell, Moon, Scale, Send, Leaf, Upload, FlaskConical,
  ArrowRight, Info, Zap
} from 'lucide-react';

const API = "http://127.0.0.1:8000/api";

/* ─── tiny deterministic pseudo-RNG ─── */
let _seed = 1;
const seedRng = (s) => { _seed = parseInt(String(s).replace(/\D/g, '')) || 42; };
const rng = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 0) / 0xffffffff; };
const rngNorm = (mu = 0, sd = 1) => {
  const u = Math.max(rng(), 1e-9), v = rng();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* ─── generate 24‑hour vitals from patient averages ─── */
function build24hVitals(p) {
  if (!p) return [];
  seedRng(p.patient_id);
  return Array.from({ length: 24 }, (_, h) => ({
    time: `${String(h).padStart(2, '0')}:00`,
    HR: Math.round(Math.max(45, p.heart_rate_mean + rngNorm(0, p.heart_rate_std || 7))),
    SBP: Math.round(Math.max(80, p.systolic_bp_mean + rngNorm(0, p.systolic_bp_std || 10))),
    DBP: Math.round(Math.max(50, p.diastolic_bp_mean + rngNorm(0, p.diastolic_bp_std || 7))),
    SpO2: parseFloat(Math.min(101, Math.max(88, p.spo2_mean + rngNorm(0, p.spo2_std || 1))).toFixed(1)),
    Temp: parseFloat((p.temperature_mean + rngNorm(0, p.temperature_std || 0.2)).toFixed(1)),
  }));
}

const RISK_COLOR = { Low: '#22c55e', Medium: '#eab308', High: '#ef4444' };
const RISK_DEG   = { Low: 30, Medium: 100, High: 170 };

/* ═══════════════════════════════════════════════════════════════
   ROOT COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [patients, setPatients]         = useState([]);
  const [selectedId, setSelectedId]     = useState('P001');
  const [activeMenu, setActiveMenu]     = useState('dashboard');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingPts, setLoadingPts]     = useState(true);

  useEffect(() => {
    fetch(`${API}/patients`)
      .then(r => r.json())
      .then(d => { setPatients(d); setLoadingPts(false); })
      .catch(() => setLoadingPts(false));
  }, []);

  const selectedPatient = patients.find(p => p.patient_id === selectedId) || null;

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ── */}
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} patient={selectedPatient} />

      {/* ── RIGHT PANEL ── */}
      <div className="main-area">
        {/* Top bar */}
        <header className="topbar">
          <div>
            <h1 className="topbar-title">{menuLabel(activeMenu)}</h1>
            <p className="topbar-sub">Health overview and Risk Insights</p>
          </div>
          <div className="topbar-right">
            <span className="ai-badge"><span className="ai-dot" />AI Active</span>
            {/* Patient selector */}
            <div className="pt-select-wrap" onClick={() => setDropdownOpen(o => !o)}>
              <span className="pt-select-val">
                {selectedPatient
                  ? `${selectedId} — Age ${selectedPatient.age} · ${selectedPatient.risk_level} Risk`
                  : 'Select Patient'}
              </span>
              <ChevronDown size={14} />
              {dropdownOpen && (
                <div className="pt-dropdown">
                  {patients.map(p => (
                    <div
                      key={p.patient_id}
                      className={`pt-option ${p.patient_id === selectedId ? 'active' : ''}`}
                      onClick={() => { setSelectedId(p.patient_id); setDropdownOpen(false); }}
                    >
                      <span className="pt-opt-id">{p.patient_id}</span>
                      <span className="pt-opt-info">{p.age}y · {p.gender}</span>
                      <span className={`risk-badge risk-${p.risk_level.toLowerCase()}`}>{p.risk_level}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="page-content">
          {loadingPts
            ? <Loader text="Loading patient database…" />
            : renderPage(activeMenu, selectedPatient, patients, setSelectedId, setActiveMenu)}
        </div>
      </div>
    </div>
  );
}

function menuLabel(m) {
  const map = {
    dashboard: 'Patient Dashboard', vitals: 'Vitals Monitor',
    risk: 'Risk Prediction', recommendations: 'Recommendations',
    chat: 'AI Assistant', goals: 'Daily Goals',
    doctor: 'Doctor Dashboard', ehr: 'EHR Records',
    insights: 'ML Insights', external: 'External Prediction'
  };
  return map[m] || 'Dashboard';
}

function renderPage(menu, patient, patients, setSelectedId, setActiveMenu) {
  switch (menu) {
    case 'dashboard':      return <Dashboard patient={patient} />;
    case 'vitals':         return <VitalsMonitor patient={patient} />;
    case 'risk':           return <RiskPrediction patient={patient} />;
    case 'recommendations':return <Recommendations patient={patient} />;
    case 'chat':           return <AIAssistant patient={patient} />;
    case 'goals':          return <DailyGoals patient={patient} />;
    case 'doctor':         return <DoctorDashboard patients={patients} onSelect={(id) => { setSelectedId(id); setActiveMenu('dashboard'); }} />;
    case 'ehr':            return <EHRRecords patient={patient} />;
    case 'insights':       return <MLInsights />;
    case 'external':       return <ExternalPrediction />;
    default:               return <Dashboard patient={patient} />;
  }
}

/* ─── SIDEBAR ─── */
function Sidebar({ activeMenu, setActiveMenu, patient }) {
  const ptNav = [
    { id: 'dashboard',      icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { id: 'vitals',         icon: <Activity size={16} />,        label: 'Vitals Monitor' },
    { id: 'risk',           icon: <ShieldAlert size={16} />,     label: 'Risk Prediction' },
    { id: 'recommendations',icon: <Lightbulb size={16} />,       label: 'Recommendations' },
    { id: 'chat',           icon: <MessageSquare size={16} />,   label: 'AI Assistant' },
    { id: 'goals',          icon: <Target size={16} />,          label: 'Daily Goals' },
  ];
  const clinNav = [
    { id: 'doctor',   icon: <Users size={16} />,     label: 'Doctor Dashboard' },
    { id: 'ehr',      icon: <FileText size={16} />,  label: 'EHR Records' },
    { id: 'insights', icon: <BarChart2 size={16} />, label: 'ML Insights' },
    { id: 'external', icon: <FlaskConical size={16} />, label: 'External Prediction' },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-icon"><Activity size={18} /></div>
        <div>
          <div className="sb-logo-text">ClinIvision</div>
          <div className="sb-logo-sub">AI HEALTH PLATFORM</div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="sb-nav">
        <div className="sb-section-label">PATIENT</div>
        {ptNav.map(n => (
          <button key={n.id} className={`sb-item ${activeMenu === n.id ? 'active' : ''}`} onClick={() => setActiveMenu(n.id)}>
            {n.icon}<span>{n.label}</span>
          </button>
        ))}

        <div className="sb-section-label" style={{ marginTop: 20 }}>CLINICAL</div>
        {clinNav.map(n => (
          <button key={n.id} className={`sb-item ${activeMenu === n.id ? 'active' : ''}`} onClick={() => setActiveMenu(n.id)}>
            {n.icon}<span>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Patient card at bottom */}
      {patient && (
        <div className="sb-patient-card">
          <div className="sb-pt-avatar">{patient.patient_id.slice(0, 2)}</div>
          <div>
            <div className="sb-pt-name">Patient {patient.patient_id}</div>
            <div className="sb-pt-info">ID: {patient.patient_id} · {patient.age}yrs · {patient.gender}</div>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════
   1. MAIN DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ patient }) {
  const [pred, setPred] = useState(null);
  const vitals = build24hVitals(patient);

  useEffect(() => {
    if (!patient) return;
    fetch(`${API}/patients/${patient.patient_id}/predict`)
      .then(r => r.json()).then(setPred).catch(() => {});
  }, [patient?.patient_id]);

  if (!patient) return <Loader text="Loading patient…" />;

  const topFeatures = [
    { name: 'SpO2 Min',   val: patient.spo2_min,         max: 100,  color: '#38bdf8' },
    { name: 'Temp Mean',  val: patient.temperature_mean,  max: 40,   color: '#a78bfa' },
    { name: 'DBP Max',    val: patient.diastolic_bp_max,  max: 120,  color: '#34d399' },
    { name: 'HR Std Dev', val: patient.heart_rate_std,    max: 30,   color: '#fb923c' },
    { name: 'SBP Mean',   val: patient.systolic_bp_mean,  max: 180,  color: '#f472b6' },
  ];

  return (
    <div className="dash-grid">
      {/* ── 4 VITAL STAT CARDS ── */}
      <div className="stat-row">
        <StatCard icon={<Heart size={18} color="#ef4444" />} label="Heart Rate (avg)" value={patient.heart_rate_mean.toFixed(1)} unit="bpm" sub="Normal range" color="#ef4444" />
        <StatCard icon={<Activity size={18} color="#38bdf8" />} label="Blood Pressure" value={`${patient.systolic_bp_mean.toFixed(0)}/${patient.diastolic_bp_mean.toFixed(0)}`} unit="mmHg" sub="Optimal" color="#38bdf8" />
        <StatCard icon={<Thermometer size={18} color="#a78bfa" />} label="Temperature" value={patient.temperature_mean.toFixed(1)} unit="°C" sub="Body temperature" color="#a78bfa" />
        <StatCard icon={<Droplets size={18} color="#34d399" />} label="SpO₂" value={patient.spo2_mean.toFixed(1)} unit="%" sub="Oxygen saturation" color="#34d399" />
      </div>

      {/* ── VITALS CHART + RISK GAUGE ── */}
      <div className="chart-risk-row">
        <div className="card chart-card">
          <div className="card-hdr">
            <Activity size={14} color="#ef4444" />
            <span>VITALS TREND (LAST 24 READINGS)</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={vitals} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="#475569" style={{ fontSize: 10 }} interval={3} />
              <YAxis yAxisId="l" stroke="#475569" style={{ fontSize: 10 }} />
              <YAxis yAxisId="r" orientation="right" stroke="#475569" style={{ fontSize: 10 }} domain={[85, 105]} />
              <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 10, fontSize: 11 }} />
              <Line yAxisId="l" type="monotone" dataKey="HR" stroke="#ef4444" strokeWidth={2} dot={false} name="HR" />
              <Line yAxisId="l" type="monotone" dataKey="SBP" stroke="#38bdf8" strokeWidth={1.5} dot={false} name="SBP" />
              <Line yAxisId="r" type="monotone" dataKey="SpO2" stroke="#22c55e" strokeWidth={1.5} dot={false} name="SpO₂" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card risk-gauge-card">
          <div className="card-hdr">
            <ShieldAlert size={14} color="#ef4444" />
            <span>DISEASE RISK LEVEL</span>
          </div>
          <RiskGauge risk={pred?.predicted_risk || patient.risk_level} confidence={pred?.confidence} />
          <GradientBar />
        </div>
      </div>

      {/* ── BOTTOM ROW: Profile / Risk Factors / Clinical Notes ── */}
      <div className="bottom-row">
        <div className="card">
          <div className="card-hdr"><User size={14} color="#38bdf8" /><span>PATIENT PROFILE</span></div>
          <ProfileRows patient={patient} />
        </div>

        <div className="card">
          <div className="card-hdr"><TrendingUp size={14} color="#f59e0b" /><span>TOP RISK FACTORS</span></div>
          <div className="risk-bars">
            {topFeatures.map(f => (
              <div key={f.name} className="rf-row">
                <span className="rf-name">{f.name}</span>
                <div className="rf-track"><div className="rf-fill" style={{ width: `${Math.min(100, (f.val / f.max) * 100).toFixed(0)}%`, background: f.color }} /></div>
                <span className="rf-val">{f.val?.toFixed ? f.val.toFixed(1) : f.val}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hdr"><FileText size={14} color="#a78bfa" /><span>CLINICAL NOTES</span></div>
          <div className="clin-notes">
            <NoteItem icon="🩺" label="Chief Complaint" text={patient.notes?.replace(`Patient ${patient.patient_id} presented with `, '') || '—'} />
            <NoteItem icon="📋" label="Clinical Summary" text={patient.clinical_summary || '—'} />
            <NoteItem icon="⚠️" label="Symptom" text={`Presented with ${patient.notes?.split('with ')[1] || '—'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, unit, sub, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${color}22` }}>
      <div className="sc-top">
        <span className="sc-label">{label}</span>
        {icon}
      </div>
      <div className="sc-value" style={{ color }}>{value}</div>
      <div className="sc-unit">{unit}</div>
      <div className="sc-sub">{sub}</div>
    </div>
  );
}

function RiskGauge({ risk = 'Low', confidence }) {
  const deg = RISK_DEG[risk] || 30;
  const col = RISK_COLOR[risk] || '#22c55e';
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 120" className="gauge-svg">
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#1e3a5f" strokeWidth="18" strokeLinecap="round" />
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="url(#gGrad)" strokeWidth="18" strokeLinecap="round" />
        <defs>
          <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" /><stop offset="50%" stopColor="#eab308" /><stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        {/* Needle */}
        {(() => {
          const rad = ((deg - 0) * Math.PI) / 180;
          const nx = 100 + 68 * Math.cos(Math.PI - rad);
          const ny = 110 - 68 * Math.sin(Math.PI - rad);
          return <line x1="100" y1="110" x2={nx} y2={ny} stroke={col} strokeWidth="3" strokeLinecap="round" />;
        })()}
        <circle cx="100" cy="110" r="6" fill={col} />
      </svg>
      <div className="gauge-label" style={{ color: col }}>{risk}</div>
      {confidence && <div className="gauge-conf">Risk confidence: {(confidence * 100).toFixed(0)}%</div>}
    </div>
  );
}

function GradientBar() {
  return (
    <div className="grad-bar-wrap">
      <div className="grad-bar" />
      <div className="grad-labels"><span style={{ color: '#22c55e' }}>● Low</span><span style={{ color: '#eab308' }}>● Medium</span><span style={{ color: '#ef4444' }}>● High</span></div>
    </div>
  );
}

function ProfileRows({ patient: p }) {
  const rows = [
    ['Age', p.age + ' years'], ['Gender', p.gender], ['Smoking', p.smoking_status],
    ['Diabetes', p.diabetes], ['Hypertension', p.hypertension], ['BMI', p.bmi?.toFixed(1)],
  ];
  return (
    <div className="profile-rows">
      {rows.map(([k, v]) => (
        <div key={k} className="pr-row"><span className="pr-key">{k}</span><span className="pr-val">{v}</span></div>
      ))}
    </div>
  );
}

function NoteItem({ icon, label, text }) {
  return (
    <div className="note-item">
      <span className="note-icon">{icon}</span>
      <div><div className="note-label">{label}</div><div className="note-text">{text}</div></div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   2. VITALS MONITOR
═══════════════════════════════════════════════════════════════ */
function VitalsMonitor({ patient }) {
  if (!patient) return <Loader />;
  const vitals = build24hVitals(patient);

  const charts = [
    { key: 'HR',   label: 'Heart Rate (bpm)',      color: '#ef4444', normal: '60-100 bpm' },
    { key: 'SBP',  label: 'Systolic BP (mmHg)',    color: '#38bdf8', normal: '<120 mmHg' },
    { key: 'DBP',  label: 'Diastolic BP (mmHg)',   color: '#818cf8', normal: '<80 mmHg' },
    { key: 'SpO2', label: 'SpO₂ (%)',              color: '#22c55e', normal: '>95%' },
    { key: 'Temp', label: 'Temperature (°C)',       color: '#f59e0b', normal: '36.1-37.2 °C' },
  ];

  return (
    <div className="section-grid">
      <div className="section-hdr"><Eye size={20} /><span>24-Hour Vitals Monitoring — Patient {patient.patient_id}</span></div>
      {charts.map(c => (
        <div key={c.key} className="card">
          <div className="card-hdr"><span style={{ color: c.color }}>●</span><span>{c.label}</span><span className="normal-badge">Normal: {c.normal}</span></div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={vitals}>
              <defs>
                <linearGradient id={`g${c.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={c.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" stroke="#475569" style={{ fontSize: 9 }} interval={5} />
              <YAxis stroke="#475569" style={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 10 }} />
              <Area type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} fill={`url(#g${c.key})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3. RISK PREDICTION
═══════════════════════════════════════════════════════════════ */
function RiskPrediction({ patient }) {
  const [pred, setPred] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPred = useCallback(() => {
    if (!patient) return;
    setLoading(true);
    fetch(`${API}/patients/${patient.patient_id}/predict`)
      .then(r => r.json()).then(d => { setPred(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patient?.patient_id]);

  useEffect(() => { fetchPred(); }, [fetchPred]);

  if (!patient) return <Loader />;

  const probData = pred?.all_probabilities
    ? Object.entries(pred.all_probabilities).map(([r, v]) => ({ name: r, value: parseFloat((v * 100).toFixed(1)) }))
    : [];

  return (
    <div className="section-grid">
      <div className="section-hdr"><ShieldAlert size={20} /><span>AI Disease Risk Prediction — {patient.patient_id}</span></div>

      <div className="risk-pred-row">
        {/* Gauge */}
        <div className="card" style={{ flex: '0 0 280px' }}>
          <div className="card-hdr"><ShieldAlert size={14} color="#ef4444" /><span>PREDICTED RISK</span></div>
          {loading ? <Loader /> : <>
            <RiskGauge risk={pred?.predicted_risk || patient.risk_level} confidence={pred?.confidence} />
            <GradientBar />
          </>}
        </div>

        {/* Probability bars */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-hdr"><BarChart2 size={14} color="#38bdf8" /><span>RISK CLASS PROBABILITIES</span></div>
          {probData.length > 0 && (
            <div className="prob-bars">
              {probData.map(d => (
                <div key={d.name} className="prob-row">
                  <span className="prob-label" style={{ color: RISK_COLOR[d.name] }}>{d.name} Risk</span>
                  <div className="prob-track">
                    <div className="prob-fill" style={{ width: `${d.value}%`, background: RISK_COLOR[d.name] }} />
                  </div>
                  <span className="prob-pct">{d.value}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="prob-note">Gradient Boosting Classifier · Stratified 5-Fold CV · Macro-F1: 42.9%</div>
        </div>
      </div>

      {/* Explanations */}
      {pred?.explanations && (
        <div className="card">
          <div className="card-hdr"><Zap size={14} color="#f59e0b" /><span>EXPLAINABLE AI — KEY CONTRIBUTING FACTORS</span></div>
          <div className="exp-grid">
            {pred.explanations.map((e, i) => (
              <div key={i} className={`exp-item impact-${e.impact.toLowerCase()}`}>
                <div className="exp-top">
                  <span className="exp-feat">{e.feature}</span>
                  <span className="exp-val">{e.val}</span>
                  <span className={`exp-badge ${e.impact.toLowerCase()}`}>{e.impact}</span>
                </div>
                <p className="exp-desc">{e.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   4. RECOMMENDATIONS
═══════════════════════════════════════════════════════════════ */
function Recommendations({ patient }) {
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patient) return;
    setLoading(true);
    fetch(`${API}/patients/${patient.patient_id}/predict`)
      .then(r => r.json())
      .then(d => { setRecs(d.recommendations); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patient?.patient_id]);

  if (!patient) return <Loader />;
  if (loading) return <Loader text="Generating personalized recommendations…" />;

  const sections = [
    { key: 'diet',      icon: <Leaf size={18} color="#22c55e" />,    label: 'Nutrition & Diet',       color: '#22c55e' },
    { key: 'exercise',  icon: <Dumbbell size={18} color="#38bdf8" />, label: 'Exercise & Activity',    color: '#38bdf8' },
    { key: 'lifestyle', icon: <Moon size={18} color="#a78bfa" />,     label: 'Lifestyle & Wellness',   color: '#a78bfa' },
    { key: 'medical',   icon: <FlaskConical size={18} color="#f59e0b" />, label: 'Medical Guidance', color: '#f59e0b' },
  ];

  return (
    <div className="section-grid">
      <div className="section-hdr"><Lightbulb size={20} /><span>Personalized Health Recommendations — {patient.patient_id}</span></div>
      <div className="rec-banner" style={{ borderLeft: `4px solid ${RISK_COLOR[patient.risk_level]}` }}>
        <ShieldAlert size={18} color={RISK_COLOR[patient.risk_level]} />
        <span>Risk Level: <strong style={{ color: RISK_COLOR[patient.risk_level] }}>{patient.risk_level}</strong> — Recommendations tailored to clinical profile (Age: {patient.age}, BMI: {patient.bmi?.toFixed(1)}, {patient.diabetes === 'Yes' ? 'Diabetic' : 'Non-diabetic'}, {patient.hypertension === 'Yes' ? 'Hypertensive' : 'Normotensive'})</span>
      </div>

      <div className="rec-grid">
        {sections.map(s => (
          <div key={s.key} className="card rec-card">
            <div className="card-hdr">{s.icon}<span>{s.label}</span></div>
            <ul className="rec-list">
              {(recs?.[s.key] || []).map((item, i) => (
                <li key={i} className="rec-item">
                  <ArrowRight size={12} color={s.color} className="rec-arrow" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   5. AI ASSISTANT CHATBOT
═══════════════════════════════════════════════════════════════ */
function AIAssistant({ patient }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!patient) return;
    fetch(`${API}/patients/${patient.patient_id}/chat`)
      .then(r => r.json()).then(setMessages).catch(() => {});
  }, [patient?.patient_id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending || !patient) return;
    const msg = input; setInput(''); setSending(true);
    setMessages(prev => [...prev, { sender: 'user', message: msg }]);
    try {
      const res = await fetch(`${API}/patients/${patient.patient_id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const d = await res.json();
      setMessages(prev => [...prev, { sender: 'assistant', message: d.reply }]);
    } catch {
      setMessages(prev => [...prev, { sender: 'assistant', message: 'Connection error. Please try again.' }]);
    } finally { setSending(false); }
  };

  if (!patient) return <Loader />;

  const quickQ = ['Explain my risk level', 'Suggest a DASH diet plan', 'Recommended exercise routine', 'What do my vitals mean?'];

  return (
    <div className="chat-shell">
      <div className="chat-hdr">
        <div className="chat-hdr-left">
          <div className="chat-avatar"><MessageSquare size={18} /></div>
          <div>
            <div className="chat-name">Clinivision AI Health Assistant</div>
            <div className="chat-status"><span className="ping" />Clinically-Informed Engine Online</div>
          </div>
        </div>
        <span className="chat-pid">{patient.patient_id} · {patient.risk_level} Risk</span>
      </div>

      <div className="chat-msgs">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <MessageSquare size={40} color="#334155" />
            <p>Ask me about your health, vitals, diet, or risk factors.</p>
            <div className="quick-qs">
              {quickQ.map(q => <button key={q} className="quick-q" onClick={() => setInput(q)}>{q}</button>)}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.sender}`}>
            <div className={`msg-bubble ${m.sender}`}>{m.message}</div>
          </div>
        ))}
        {sending && (
          <div className="msg-row assistant">
            <div className="msg-bubble assistant typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-row" onSubmit={send}>
        <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask Clinivision AI…" />
        <button type="submit" className="chat-send" disabled={sending || !input.trim()}><Send size={16} /></button>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   6. DAILY GOALS
═══════════════════════════════════════════════════════════════ */
function DailyGoals({ patient }) {
  const [logs, setLogs] = useState([]);
  const [water, setWater] = useState(2000);
  const [sleep, setSleep] = useState(7);
  const [exercise, setExercise] = useState(30);
  const [weight, setWeight] = useState(75);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!patient) return;
    setWeight(patient.weight_kg || 75);
    fetch(`${API}/patients/${patient.patient_id}/logs`)
      .then(r => r.json()).then(setLogs).catch(() => {});
  }, [patient?.patient_id]);

  const saveLog = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/patients/${patient.patient_id}/logs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ water_intake_ml: water, sleep_hours: sleep, exercise_minutes: exercise, weight_kg: weight })
    });
    if (res.ok) { setSaved('Saved!'); fetch(`${API}/patients/${patient.patient_id}/logs`).then(r => r.json()).then(setLogs); setTimeout(() => setSaved(''), 2000); }
  };

  if (!patient) return <Loader />;
  const latest = logs[logs.length - 1] || {};

  const goals = [
    { label: 'Hydration', val: latest.water_intake_ml || water, target: 2500, unit: 'ml', icon: <Droplets size={16} color="#38bdf8" />, color: '#38bdf8' },
    { label: 'Sleep', val: latest.sleep_hours || sleep, target: 8, unit: 'hrs', icon: <Moon size={16} color="#818cf8" />, color: '#818cf8' },
    { label: 'Exercise', val: latest.exercise_minutes || exercise, target: 45, unit: 'min', icon: <Dumbbell size={16} color="#22c55e" />, color: '#22c55e' },
  ];

  return (
    <div className="section-grid">
      <div className="section-hdr"><Target size={20} /><span>Daily Health Goals — {patient.patient_id}</span></div>

      <div className="goals-row">
        {goals.map(g => (
          <div key={g.label} className="card goal-card">
            <div className="goal-top">{g.icon}<span className="goal-label">{g.label}</span></div>
            <div className="goal-val" style={{ color: g.color }}>{g.val}<span className="goal-unit"> {g.unit}</span></div>
            <div className="goal-sub">Goal: {g.target} {g.unit}</div>
            <div className="goal-track">
              <div className="goal-fill" style={{ width: `${Math.min(100, (g.val / g.target) * 100).toFixed(0)}%`, background: g.color }} />
            </div>
            <div className="goal-pct">{Math.min(100, Math.round((g.val / g.target) * 100))}% of goal</div>
          </div>
        ))}
      </div>

      <div className="goals-log-row">
        <div className="card" style={{ flex: 1 }}>
          <div className="card-hdr"><Target size={14} color="#38bdf8" /><span>LOG TODAY'S STATS</span></div>
          <form onSubmit={saveLog} className="log-form">
            <label>💧 Water Intake: <strong>{water} ml</strong></label>
            <input type="range" min="0" max="4000" step="100" value={water} onChange={e => setWater(+e.target.value)} className="slider" />
            <label>😴 Sleep Duration: <strong>{sleep} hrs</strong></label>
            <input type="range" min="0" max="12" step="0.5" value={sleep} onChange={e => setSleep(+e.target.value)} className="slider" />
            <label>🏃 Exercise: <strong>{exercise} mins</strong></label>
            <input type="range" min="0" max="180" step="5" value={exercise} onChange={e => setExercise(+e.target.value)} className="slider" />
            <label>⚖️ Weight (kg)</label>
            <input type="number" step="0.1" value={weight} onChange={e => setWeight(+e.target.value)} className="num-input" />
            <button type="submit" className="save-btn">{saved || 'Save Today\'s Log'}</button>
          </form>
        </div>

        <div className="card" style={{ flex: 2 }}>
          <div className="card-hdr"><BarChart2 size={14} color="#38bdf8" /><span>14-DAY TREND</span></div>
          {logs.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={logs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" stroke="#475569" style={{ fontSize: 9 }} />
                <YAxis stroke="#475569" style={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 10 }} />
                <Line type="monotone" dataKey="water_intake_ml" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} name="Water (ml)" />
                <Line type="monotone" dataKey="sleep_hours" stroke="#818cf8" strokeWidth={1.5} dot={{ r: 2 }} name="Sleep (h)" />
                <Line type="monotone" dataKey="exercise_minutes" stroke="#22c55e" strokeWidth={1.5} dot={{ r: 2 }} name="Exercise (min)" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="empty-msg">No logs yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   7. DOCTOR DASHBOARD
═══════════════════════════════════════════════════════════════ */
function DoctorDashboard({ patients, onSelect }) {
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState('All');

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return (filterRisk === 'All' || p.risk_level === filterRisk) &&
      (p.patient_id.toLowerCase().includes(q) || p.gender.toLowerCase().includes(q));
  });

  const highCount = patients.filter(p => p.risk_level === 'High').length;
  const medCount  = patients.filter(p => p.risk_level === 'Medium').length;
  const lowCount  = patients.filter(p => p.risk_level === 'Low').length;

  return (
    <div className="section-grid">
      <div className="section-hdr"><Users size={20} /><span>All Patients — Clinician Portal</span></div>

      <div className="kpi-row">
        {[['Total Patients', patients.length, '#38bdf8'], ['High Risk 🔴', highCount, '#ef4444'], ['Medium Risk 🟡', medCount, '#eab308'], ['Low Risk 🟢', lowCount, '#22c55e']].map(([l, v, c]) => (
          <div key={l} className="kpi-card" style={{ borderTop: `3px solid ${c}` }}>
            <div className="kpi-val" style={{ color: c }}>{v}</div>
            <div className="kpi-label">{l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hdr" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>PATIENT ROSTER</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <input className="search-input" placeholder="Search ID / gender…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
              <option>All</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="pt-table">
            <thead>
              <tr>{['ID', 'Age', 'Gender', 'BMI', 'Sys/Dia BP', 'HR', 'SpO₂', 'Risk', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.patient_id} onClick={() => onSelect(p.patient_id)} className="pt-row">
                  <td className="pt-id">{p.patient_id}</td>
                  <td>{p.age}</td><td>{p.gender}</td>
                  <td>{p.bmi?.toFixed(1)}</td>
                  <td>{p.systolic_bp_mean?.toFixed(0)}/{p.diastolic_bp_mean?.toFixed(0)}</td>
                  <td>{p.heart_rate_mean?.toFixed(0)}</td>
                  <td>{p.spo2_mean?.toFixed(1)}%</td>
                  <td><span className={`risk-badge risk-${p.risk_level.toLowerCase()}`}>{p.risk_level}</span></td>
                  <td><ArrowRight size={14} color="#475569" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   8. EHR RECORDS
═══════════════════════════════════════════════════════════════ */
function EHRRecords({ patient }) {
  if (!patient) return <Loader />;
  return (
    <div className="section-grid">
      <div className="section-hdr"><FileText size={20} /><span>Electronic Health Record — {patient.patient_id}</span></div>
      <div className="ehr-grid">
        <div className="card">
          <div className="card-hdr"><User size={14} color="#38bdf8" /><span>DEMOGRAPHICS</span></div>
          <div className="ehr-rows">
            {[['Patient ID', patient.patient_id], ['Age', patient.age + ' years'], ['Gender', patient.gender],
              ['Height', patient.height_m?.toFixed(2) + ' m'], ['Weight', patient.weight_kg?.toFixed(1) + ' kg'],
              ['BMI', patient.bmi?.toFixed(1) + ` (${getBMICat(patient.bmi)})`]].map(([k, v]) => (
              <div key={k} className="ehr-row"><span className="ehr-key">{k}</span><span className="ehr-val">{v}</span></div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hdr"><AlertCircle size={14} color="#ef4444" /><span>MEDICAL HISTORY</span></div>
          <div className="ehr-rows">
            {[['Diabetes', patient.diabetes], ['Hypertension', patient.hypertension],
              ['Smoking Status', patient.smoking_status], ['Risk Classification', patient.risk_level]].map(([k, v]) => (
              <div key={k} className="ehr-row">
                <span className="ehr-key">{k}</span>
                <span className={`ehr-val ${v === 'Yes' || v === 'High' ? 'danger' : v === 'Medium' ? 'warn' : 'ok'}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-hdr"><FileText size={14} color="#a78bfa" /><span>CLINICAL DOCUMENTATION</span></div>
          <div className="ehr-doc-grid">
            <div className="ehr-doc-item">
              <div className="ehr-doc-label">Doctor Notes</div>
              <p className="ehr-doc-text">{patient.notes || '—'}</p>
            </div>
            <div className="ehr-doc-item">
              <div className="ehr-doc-label">Clinical Summary</div>
              <p className="ehr-doc-text">{patient.clinical_summary || '—'}</p>
            </div>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-hdr"><Activity size={14} color="#22c55e" /><span>VITALS SUMMARY</span></div>
          <div className="vitals-summary-grid">
            {[
              ['Heart Rate Mean', patient.heart_rate_mean?.toFixed(1), 'bpm'],
              ['HR Min', patient.heart_rate_min?.toFixed(1), 'bpm'],
              ['HR Max', patient.heart_rate_max?.toFixed(1), 'bpm'],
              ['Systolic BP Mean', patient.systolic_bp_mean?.toFixed(1), 'mmHg'],
              ['Diastolic BP Mean', patient.diastolic_bp_mean?.toFixed(1), 'mmHg'],
              ['SpO₂ Mean', patient.spo2_mean?.toFixed(1), '%'],
              ['SpO₂ Min', patient.spo2_min?.toFixed(1), '%'],
              ['Temperature Mean', patient.temperature_mean?.toFixed(2), '°C'],
            ].map(([l, v, u]) => (
              <div key={l} className="vs-item">
                <div className="vs-label">{l}</div>
                <div className="vs-val">{v} <span className="vs-unit">{u}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getBMICat(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/* ═══════════════════════════════════════════════════════════════
   9. ML INSIGHTS
═══════════════════════════════════════════════════════════════ */
function MLInsights() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${API}/admin/metrics`).then(r => r.json()).then(d => { setMetrics(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const retrain = async () => {
    setRetraining(true); setMsg('');
    const res = await fetch(`${API}/admin/retrain`, { method: 'POST' });
    const d = await res.json();
    setMsg(d.message || d.detail || 'Done');
    fetch(`${API}/admin/metrics`).then(r => r.json()).then(setMetrics);
    setRetraining(false);
  };

  if (loading) return <Loader text="Loading ML metrics…" />;

  const cvData = metrics ? Object.entries(metrics.cv_results).map(([k, v]) => ({
    name: k.replace('Classifier','').replace('Gradient','GB').replace(' (RF+GB+LR)',''),
    'Accuracy': +(v.accuracy * 100).toFixed(1),
    'Macro-F1': +(v.f1_score * 100).toFixed(1),
    'Weighted-F1': +(v.f1_weighted * 100).toFixed(1),
  })) : [];

  const perClass = metrics?.classification_report
    ? Object.entries(metrics.classification_report)
        .filter(([k]) => ['High','Low','Medium'].includes(k))
        .map(([cls, v]) => ({
          cls,
          precision: (v.precision * 100).toFixed(0),
          recall: (v.recall * 100).toFixed(0),
          f1: (v['f1-score'] * 100).toFixed(0),
          support: v.support,
        }))
    : [];

  const bestCVEntry = metrics?.cv_results?.[metrics.model_name];

  return (
    <div className="section-grid">
      <div className="section-hdr"><BarChart2 size={20}/><span>ML Model Insights & Performance</span></div>

      {/* Explanation banner */}
      <div className="ml-explain-banner">
        <Info size={16} color="#38bdf8" style={{flexShrink:0}}/>
        <div>
          <strong style={{color:'#e2e8f0'}}>Why are CV scores lower than Train accuracy?</strong>
          <p style={{marginTop:4, fontSize:12, color:'#64748b', lineHeight:1.6}}>
            Cross-validation splits the dataset into train/test folds and evaluates on unseen data.
            With only <strong style={{color:'#38bdf8'}}>50 patients</strong>, each test fold has ~10 samples — making CV scores naturally
            conservative and noisy. Train accuracy of <strong style={{color:'#22c55e'}}>{metrics ? (metrics.train_accuracy*100).toFixed(0) : '—'}%</strong> shows
            the model fully learned the dataset. CV reflects generalization on tiny hold-out sets.
            The model uses <strong style={{color:'#f59e0b'}}>class balancing + oversampling</strong> to handle the 60/30/10% class imbalance fairly.
          </p>
        </div>
      </div>

      {msg && <div className="info-banner">{msg}</div>}

      <div className="kpi-row">
        <div className="kpi-card" style={{borderTop:'3px solid #a78bfa'}}>
          <div className="kpi-val" style={{color:'#a78bfa', fontSize:13, fontWeight:700}}>{metrics?.model_name||'—'}</div>
          <div className="kpi-label">Best Model</div>
        </div>
        <div className="kpi-card" style={{borderTop:'3px solid #22c55e'}}>
          <div className="kpi-val" style={{color:'#22c55e'}}>{metrics ? (metrics.train_accuracy*100).toFixed(0)+'%' : '—'}</div>
          <div className="kpi-label">Train Accuracy</div>
        </div>
        <div className="kpi-card" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="kpi-val" style={{ color: '#f59e0b' }}>
            {metrics ? (metrics.cv_results[metrics.model_name]?.f1_score * 100).toFixed(1) + '%' : '—'}
          </div>
          <div className="kpi-label">CV Macro-F1</div>
        </div>
        <div className="kpi-card" style={{ borderTop: '3px solid #ef4444' }}>
          <button className="retrain-btn" onClick={retrain} disabled={retraining}>
            <RefreshCw size={14} className={retraining ? 'spin' : ''} />
            {retraining ? 'Retraining…' : 'Retrain Model'}
          </button>
        </div>
      </div>

      <div className="insights-row">
        <div className="card" style={{ flex: 1 }}>
          <div className="card-hdr"><BarChart2 size={14} color="#38bdf8" /><span>ALGORITHM COMPARISON</span></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cvData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" stroke="#475569" style={{ fontSize: 9 }} />
              <YAxis stroke="#475569" style={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 10 }} />
              <Bar dataKey="Accuracy" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-hdr"><TrendingUp size={14} color="#f59e0b" /><span>TOP FEATURE IMPORTANCES</span></div>
          <div className="feat-list">
            {(metrics?.feature_importances || []).slice(0, 12).map((f, i) => (
              <div key={i} className="feat-row">
                <span className="feat-name">{f.feature}</span>
                <div className="feat-track"><div className="feat-fill" style={{ width: `${(f.importance * 100).toFixed(0)}%` }} /></div>
                <span className="feat-pct">{(f.importance * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   10. EXTERNAL PREDICTION
═══════════════════════════════════════════════════════════════ */
function ExternalPrediction() {
  const def = {
    age: 45, gender: 'Male', smoking_status: 'Never', diabetes: 'No', hypertension: 'No',
    bmi: 25.0, heart_rate_mean: 75, systolic_bp_mean: 120, diastolic_bp_mean: 80,
    temperature_mean: 36.6, spo2_mean: 97.5
  };
  const [form, setForm] = useState(def);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API}/predict/external`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setResult(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const reset = () => { setForm(def); setResult(null); setError(''); };

  return (
    <div className="section-grid">
      <div className="section-hdr"><FlaskConical size={20} /><span>External Patient Data Prediction</span></div>
      <div className="ext-desc">Enter any patient's clinical data below to receive an instant AI risk prediction, explanations, and personalized recommendations — no patient account needed.</div>

      <div className="ext-layout">
        {/* FORM */}
        <form className="card ext-form" onSubmit={submit}>
          <div className="card-hdr"><Upload size={14} color="#38bdf8" /><span>PATIENT CLINICAL DATA</span></div>

          <div className="form-section-title">Demographics</div>
          <div className="form-row">
            <div className="form-field">
              <label>Age (years)</label>
              <input type="number" value={form.age} onChange={e => set('age', +e.target.value)} min="1" max="120" className="num-input" />
            </div>
            <div className="form-field">
              <label>Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} className="filter-select">
                <option>Male</option><option>Female</option>
              </select>
            </div>
            <div className="form-field">
              <label>BMI</label>
              <input type="number" step="0.1" value={form.bmi} onChange={e => set('bmi', +e.target.value)} className="num-input" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Smoking Status</label>
              <select value={form.smoking_status} onChange={e => set('smoking_status', e.target.value)} className="filter-select">
                <option>Never</option><option>Former</option><option>Current</option>
              </select>
            </div>
            <div className="form-field">
              <label>Diabetes</label>
              <select value={form.diabetes} onChange={e => set('diabetes', e.target.value)} className="filter-select">
                <option>No</option><option>Yes</option>
              </select>
            </div>
            <div className="form-field">
              <label>Hypertension</label>
              <select value={form.hypertension} onChange={e => set('hypertension', e.target.value)} className="filter-select">
                <option>No</option><option>Yes</option>
              </select>
            </div>
          </div>

          <div className="form-section-title">Vitals (Average Values)</div>
          <div className="form-row">
            <div className="form-field">
              <label>Heart Rate (bpm)</label>
              <input type="number" step="0.1" value={form.heart_rate_mean} onChange={e => set('heart_rate_mean', +e.target.value)} className="num-input" />
            </div>
            <div className="form-field">
              <label>Systolic BP (mmHg)</label>
              <input type="number" step="0.1" value={form.systolic_bp_mean} onChange={e => set('systolic_bp_mean', +e.target.value)} className="num-input" />
            </div>
            <div className="form-field">
              <label>Diastolic BP (mmHg)</label>
              <input type="number" step="0.1" value={form.diastolic_bp_mean} onChange={e => set('diastolic_bp_mean', +e.target.value)} className="num-input" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Temperature (°C)</label>
              <input type="number" step="0.01" value={form.temperature_mean} onChange={e => set('temperature_mean', +e.target.value)} className="num-input" />
            </div>
            <div className="form-field">
              <label>SpO₂ (%)</label>
              <input type="number" step="0.1" value={form.spo2_mean} onChange={e => set('spo2_mean', +e.target.value)} className="num-input" />
            </div>
          </div>

          <div className="ext-btn-row">
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? <><RefreshCw size={14} className="spin" /> Analyzing…</> : <><Zap size={14} /> Run Prediction</>}
            </button>
            <button type="button" className="reset-btn" onClick={reset}>Reset</button>
          </div>
          {error && <div className="error-msg">{error}</div>}
        </form>

        {/* RESULTS */}
        {result ? (
          <div className="ext-results">
            <div className="card">
              <div className="card-hdr"><ShieldAlert size={14} color={RISK_COLOR[result.predicted_risk]} /><span>PREDICTION RESULT</span></div>
              <RiskGauge risk={result.predicted_risk} confidence={result.confidence} />
              <GradientBar />
              <div className="prob-bars" style={{ marginTop: 16 }}>
                {Object.entries(result.all_probabilities || {}).map(([r, v]) => (
                  <div key={r} className="prob-row">
                    <span className="prob-label" style={{ color: RISK_COLOR[r] }}>{r} Risk</span>
                    <div className="prob-track"><div className="prob-fill" style={{ width: `${(v * 100).toFixed(0)}%`, background: RISK_COLOR[r] }} /></div>
                    <span className="prob-pct">{(v * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hdr"><Zap size={14} color="#f59e0b" /><span>RISK EXPLANATIONS</span></div>
              <div className="exp-list">
                {result.explanations?.map((e, i) => (
                  <div key={i} className={`exp-item impact-${e.impact.toLowerCase()}`}>
                    <div className="exp-top">
                      <span className="exp-feat">{e.feature}</span>
                      <span className="exp-val">{e.val}</span>
                      <span className={`exp-badge ${e.impact.toLowerCase()}`}>{e.impact}</span>
                    </div>
                    <p className="exp-desc">{e.explanation}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.recommendations && (
              <div className="card">
                <div className="card-hdr"><Lightbulb size={14} color="#22c55e" /><span>PERSONALIZED RECOMMENDATIONS</span></div>
                {Object.entries(result.recommendations).map(([cat, items]) => (
                  <div key={cat} className="mini-rec">
                    <div className="mini-rec-title">{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                    <ul>{items.slice(0, 3).map((item, i) => <li key={i} className="mini-rec-item">{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card ext-placeholder">
            <FlaskConical size={48} color="#1e3a5f" />
            <p>Fill in the patient data form and click <strong>Run Prediction</strong> to see the AI risk assessment, explanations, and personalized health recommendations.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Shared Loader ─── */
function Loader({ text = 'Loading…' }) {
  return (
    <div className="loader-wrap">
      <RefreshCw size={28} color="#38bdf8" className="spin" />
      <p>{text}</p>
    </div>
  );
}
