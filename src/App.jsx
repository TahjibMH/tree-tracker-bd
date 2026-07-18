import React, { useState, useEffect, useRef } from "react";
import { Sprout, MapPin, Users, Building2, Landmark, ShieldAlert, Plus, TreeDeciduous, Award, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const TARGET = 250000000; // 25 crore
const PHASE1_TARGET = 15000000; // 1.5 crore

const DIVISIONS = [
  { key: "rangpur", name: "Rangpur", col: 2, row: 1, span: 1 },
  { key: "rajshahi", name: "Rajshahi", col: 1, row: 2, span: 1 },
  { key: "dhaka", name: "Dhaka", col: 2, row: 2, span: 2 },
  { key: "mymensingh", name: "Mymensingh", col: 3, row: 2, span: 1 },
  { key: "sylhet", name: "Sylhet", col: 4, row: 2, span: 1 },
  { key: "khulna", name: "Khulna", col: 1, row: 4, span: 1 },
  { key: "barishal", name: "Barishal", col: 2, row: 4, span: 1 },
  { key: "chattogram", name: "Chattogram", col: 4, row: 3, span: 2 },
];

const SPECIES_OPTIONS = [
  "Mehogoni", "Jarul", "Neem", "Garjan", "Mango", "Jackfruit",
  "Bamboo", "Guava", "Olive", "Krishnachura", "Other",
];

const SUBMITTER_TYPES = [
  { key: "citizen", label: "Citizen", icon: Users },
  { key: "ngo", label: "NGO", icon: Landmark },
  { key: "institution", label: "Institution", icon: Building2 },
  { key: "government", label: "Government", icon: ShieldAlert },
];

function formatBD(num) {
  const str = Math.floor(num).toString();
  if (str.length <= 3) return str;
  const last3 = str.slice(-3);
  let rest = str.slice(0, -3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return rest + "," + last3;
}

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    const start = prevTarget.current;
    const delta = target - start;
    const startTime = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(start + delta * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevTarget.current = target;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

const SUPABASE_URL = "https://dfubulxtovldbsdrtyfb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdWJ1bHh0b3ZsZGJzZHJ0eWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzAxNTgsImV4cCI6MjA5OTcwNjE1OH0.HP5W8pvneIlUazoC8u2wvKq8rG8QmUur_Iz8UHCKYYQ";
const BD_BOUNDS = { minLat: 20.3, maxLat: 26.7, minLng: 88.0, maxLng: 92.8 };

// Rough bounding boxes per division — used only to catch obvious mismatches
// (e.g. selecting Sylhet while standing in Khulna), not precise borders.
const DIVISION_BOUNDS = {
  rangpur: { minLat: 25.0, maxLat: 26.7, minLng: 88.0, maxLng: 89.8 },
  rajshahi: { minLat: 24.0, maxLat: 25.3, minLng: 88.0, maxLng: 89.7 },
  khulna: { minLat: 21.5, maxLat: 23.5, minLng: 88.5, maxLng: 90.0 },
  barishal: { minLat: 21.8, maxLat: 23.2, minLng: 89.8, maxLng: 91.0 },
  dhaka: { minLat: 23.4, maxLat: 24.9, minLng: 89.7, maxLng: 91.3 },
  mymensingh: { minLat: 24.4, maxLat: 25.4, minLng: 89.7, maxLng: 91.0 },
  sylhet: { minLat: 24.0, maxLat: 25.2, minLng: 91.0, maxLng: 92.5 },
  chattogram: { minLat: 20.5, maxLat: 24.0, minLng: 90.9, maxLng: 92.7 },
};
function divisionMatches(divisionKey, lat, lng) {
  const b = DIVISION_BOUNDS[divisionKey];
  if (!b) return true;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

async function signInAnon() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Anonymous sign-in failed — check it's enabled in Supabase Auth settings.");
  const data = await res.json();
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000;
  return { accessToken: data.access_token, userId: data.user?.id, expiresAt };
}

const SESSION_STORAGE_KEY = "tt-anon-session";
// Wrapped defensively — localStorage is blocked in this Claude artifact preview's
// sandboxed iframe (persistence won't work here) but works normally once deployed.
function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch (err) { return null; }
}
function storeSession(session) {
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)); } catch (err) { /* preview sandbox — ignore */ }
}

async function fetchPlantings() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/plantings?select=*&order=created_at.desc&limit=300`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error("Failed to fetch plantings");
  return res.json();
}

async function uploadPhoto(accessToken, userId, file) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/planting-photos/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type || "image/jpeg",
    },
    body: file,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Photo upload failed");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/planting-photos/${path}`;
}

async function insertPlanting(accessToken, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/plantings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Insert failed");
  }
  const data = await res.json();
  return data[0];
}

function getGeolocation() {
  return new Promise(resolve => {
    try {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 6000 }
      );
    } catch (err) {
      // Some sandboxed/embedded environments (incl. this artifact preview) block
      // the Geolocation API entirely and throw synchronously rather than erroring
      // gracefully. Treat that the same as "permission denied".
      resolve(null);
    }
  });
}

const STATUS_STYLES = {
  unverified: { label: "Unverified", color: "#8B9A8A", bg: "#F1F2EC" },
  flagged: { label: "Flagged for review", color: "#B8792A", bg: "#FBEFDD" },
  verified: { label: "Verified", color: "#2E6B3E", bg: "#E4F1E2" },
  rejected: { label: "Rejected", color: "#B84A3A", bg: "#FBE6E2" },
};

// TODO: replace with your real deployed domain once live
const VERIFY_BASE_URL = "https://tree-tracker-bd.vercel.app/verify";

async function insertCertificate(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/certificates`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Certificate request failed");
  }
  const data = await res.json();
  return data[0];
}

// Widely-cited estimates (US Forest Service / tree-planting orgs) — illustrative, not lab-measured.
function computeImpact(count) {
  const annualKg = count * 21;          // ~21kg CO2 absorbed per tree per year (mature tree)
  const lifetimeKg = count * 1000;      // ~1 tonne CO2 over ~40-year lifetime
  const carKm = annualKg / 0.12;        // avg passenger car ~120g CO2/km
  const oxygenPeople = count * 2;       // enough O2 for ~2 people/year per mature tree
  return { annualKg, lifetimeKg, carKm, oxygenPeople };
}
function fmtWeight(kg) {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} tonnes`;
  return `${Math.round(kg)} kg`;
}

function compressImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Compression failed")), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Uses Claude's vision API to confirm the photo actually shows a young tree/sapling
// before it's allowed to count toward a Verified certificate.
async function validateTreePhoto(blob) {
  const base64 = await blobToBase64(blob);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "Does this photo clearly show a small/young tree or sapling — e.g. recently planted, in soil or a small pot, visible trunk/stem and leaves? Reply with ONLY strict JSON, no markdown, no preamble: {\"is_tree\": true or false, \"confidence\": \"high\" or \"medium\" or \"low\", \"reason\": \"<one short sentence>\"}" },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error("Validation request failed");
  const data = await res.json();
  const textBlock = data.content?.find(c => c.type === "text");
  if (!textBlock) throw new Error("No response from validator");
  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawFormalCertificate(canvas, { name, species, count, division, date, certId, verifyUrl, verified }) {
  const W = 1600, H = 1200;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const impact = computeImpact(count);

  // Soft parchment background
  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, W * 0.75);
  bgGrad.addColorStop(0, "#FBF9F2");
  bgGrad.addColorStop(1, "#EFEADA");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Double border
  ctx.strokeStyle = "#1F3D2B";
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.strokeStyle = "#C99A3C";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(64, 64, W - 128, H - 128);

  // Corner diamonds
  [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]].forEach(([cx, cy]) => {
    ctx.fillStyle = "#C99A3C";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy);
    ctx.closePath(); ctx.fill();
  });

  ctx.textAlign = "center";

  // Eyebrow with flanking rules
  ctx.strokeStyle = "#C99A3C"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - 300, 122); ctx.lineTo(W / 2 - 150, 122); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 150, 122); ctx.lineTo(W / 2 + 300, 122); ctx.stroke();
  ctx.fillStyle = "#A8791F";
  ctx.font = "600 18px 'Space Grotesk', sans-serif";
  ctx.fillText("NATIONAL TREE PLANTATION CAMPAIGN · BANGLADESH", W / 2, 128);

  // Title
  ctx.fillStyle = "#1F3D2B";
  ctx.font = "700 48px 'Space Grotesk', sans-serif";
  const title = verified ? "Certificate of Verified Impact" : "Certificate of Participation";
  ctx.fillText(title, W / 2, 200);

  // Sub-line
  ctx.fillStyle = "#5B6B57";
  ctx.font = "18px 'Inter', sans-serif";
  ctx.fillText("This certifies that", W / 2, 254);

  // Name with underline rule
  ctx.fillStyle = "#16221A";
  ctx.font = "italic 700 42px 'Space Grotesk', sans-serif";
  ctx.fillText(name, W / 2, 314);
  const nameWidth = Math.min(560, ctx.measureText(name).width + 60);
  ctx.strokeStyle = "#C99A3C"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W / 2 - nameWidth / 2, 334); ctx.lineTo(W / 2 + nameWidth / 2, 334); ctx.stroke();

  ctx.fillStyle = "#5B6B57";
  ctx.font = "18px 'Inter', sans-serif";
  ctx.fillText(`for contributing ${count.toLocaleString()} ${species} tree(s) in ${division} Division · ${date}`, W / 2, 374);

  // Impact panel
  const panelY = 420, panelH = 340, panelX = 130, panelW = W - 260;
  ctx.fillStyle = "#E9F0E3";
  ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 18); ctx.fill();
  ctx.fillStyle = "#C99A3C";
  ctx.fillRect(panelX + 30, panelY, panelW - 60, 3);

  ctx.fillStyle = "#1F3D2B";
  ctx.font = "600 23px 'Space Grotesk', sans-serif";
  ctx.fillText("Environmental Impact", W / 2, panelY + 52);

  const stats = [
    { icon: "🌱", label: "CO₂ absorbed / year", value: fmtWeight(impact.annualKg) },
    { icon: "🌳", label: "CO₂ over ~40yr lifetime", value: fmtWeight(impact.lifetimeKg) },
    { icon: "🚗", label: "Car travel offset / year", value: `${Math.round(impact.carKm).toLocaleString()} km` },
    { icon: "💨", label: "Oxygen supply / year", value: `~${impact.oxygenPeople.toLocaleString()} people` },
  ];
  const colW = panelW / 2;
  // divider lines inside panel
  ctx.strokeStyle = "#D3DECB"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2, panelY + 78); ctx.lineTo(W / 2, panelY + panelH - 60); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(panelX + 40, panelY + panelH / 2 + 12); ctx.lineTo(panelX + panelW - 40, panelY + panelH / 2 + 12); ctx.stroke();

  stats.forEach((s, i) => {
    const cx = panelX + colW * (i % 2) + colW / 2;
    const cy = panelY + 130 + Math.floor(i / 2) * 108;
    ctx.fillStyle = "#1F3D2B";
    ctx.font = "700 32px 'JetBrains Mono', monospace";
    ctx.fillText(`${s.icon}  ${s.value}`, cx, cy);
    ctx.fillStyle = "#5B6B57";
    ctx.font = "14px 'Inter', sans-serif";
    ctx.fillText(s.label, cx, cy + 26);
  });

  ctx.fillStyle = "#8B9A8A";
  ctx.font = "12px 'Inter', sans-serif";
  ctx.fillText("Estimates based on widely-cited averages for a mature tree — illustrative, not lab-measured.", W / 2, panelY + panelH - 16);

  // Footer: ID + note (left) | divider | QR (right)
  const footerY = panelY + panelH + 55;
  ctx.strokeStyle = "#D8D2BE"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(120, footerY); ctx.lineTo(W - 320, footerY); ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#6B7568";
  ctx.font = "13px 'Inter', sans-serif";
  ctx.fillText(`Certificate ID`, 120, footerY + 34);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#8B9A8A";
  ctx.fillText(certId, 120, footerY + 54);
  ctx.font = "13px 'Inter', sans-serif";
  ctx.fillStyle = verified ? "#2E6B3E" : "#8B9A8A";
  ctx.fillText(verified ? "✓ Verified via photo + GPS location" : "Unverified submission", 120, footerY + 82);

  // Seal
  const sealX = W - 220, sealY = footerY + 45;
  ctx.strokeStyle = "#C99A3C"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sealX, sealY, 46, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(sealX, sealY, 38, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = "22px sans-serif";
  ctx.fillText("🌳", sealX, sealY + 8);

  try {
    const qr = await loadImage(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`);
    ctx.drawImage(qr, W - 180, footerY, 160, 160);
    ctx.font = "12px 'Inter', sans-serif";
    ctx.fillStyle = "#8B9A8A";
    ctx.fillText("Scan to verify", W - 100, footerY + 178);
  } catch (e) { /* QR optional — cert still valid without it */ }

  return canvas;
}

async function drawSocialCertificate(canvas, { name, species, count, division, certId, verifyUrl, verified }) {
  // 1080x1920 = standard Instagram/Facebook/Snapchat Story size (9:16).
  // Content is kept within a safe zone (~300px clear top, ~250px clear bottom)
  // since those areas get covered by the app's own UI (username sticker, reply bar).
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const impact = computeImpact(count);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#234A34");
  grad.addColorStop(1, "#0D1F15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft glow behind hero number
  const glow = ctx.createRadialGradient(W / 2, 620, 40, W / 2, 620, 420);
  glow.addColorStop(0, "rgba(201,154,58,0.20)");
  glow.addColorStop(1, "rgba(201,154,58,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 300, W, 650);

  ctx.textAlign = "center";

  // Badge pill (safe zone: starts at y=330, well clear of top UI overlay)
  ctx.fillStyle = "rgba(201,154,58,0.16)";
  ctx.beginPath(); ctx.roundRect(W / 2 - 230, 300, 460, 52, 26); ctx.fill();
  ctx.strokeStyle = "#C99A3C"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(W / 2 - 230, 300, 460, 52, 26); ctx.stroke();
  ctx.fillStyle = "#E4C066";
  ctx.font = "600 20px 'Space Grotesk', sans-serif";
  ctx.fillText(verified ? "🌳 VERIFIED IMPACT · BANGLADESH" : "🌳 TREE PLANTATION · BANGLADESH", W / 2, 334);

  // Hero number
  ctx.fillStyle = "#F4F1E4";
  ctx.font = "700 168px 'JetBrains Mono', monospace";
  ctx.fillText(count.toLocaleString(), W / 2, 640);
  ctx.font = "500 26px 'Inter', sans-serif";
  ctx.fillStyle = "#A9BCA6";
  ctx.fillText(`${species} trees planted · ${division} Division`, W / 2, 690);

  // Name with underline
  ctx.fillStyle = "#F4F1E4";
  ctx.font = "italic 600 40px 'Space Grotesk', sans-serif";
  ctx.fillText(name, W / 2, 770);
  const nameWidth = Math.min(420, ctx.measureText(name).width + 40);
  ctx.strokeStyle = "#C99A3C"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W / 2 - nameWidth / 2, 790); ctx.lineTo(W / 2 + nameWidth / 2, 790); ctx.stroke();

  // Impact grid — 2x2 cards
  const gridY = 850, gridH = 460, gridX = 90, gridW = W - 180, gap = 16;
  const cellW = (gridW - gap) / 2, cellH = (gridH - gap) / 2;
  const stats = [
    { icon: "🌱", label: "CO₂ / year", value: fmtWeight(impact.annualKg) },
    { icon: "🌳", label: "CO₂ over ~40yrs", value: fmtWeight(impact.lifetimeKg) },
    { icon: "🚗", label: "Car km offset/yr", value: `${Math.round(impact.carKm).toLocaleString()} km` },
    { icon: "💨", label: "O₂ for people/yr", value: `~${impact.oxygenPeople.toLocaleString()}` },
  ];
  stats.forEach((s, i) => {
    const cx = gridX + (i % 2) * (cellW + gap);
    const cy = gridY + Math.floor(i / 2) * (cellH + gap);
    ctx.fillStyle = "rgba(244,241,228,0.07)";
    ctx.beginPath(); ctx.roundRect(cx, cy, cellW, cellH, 18); ctx.fill();
    ctx.strokeStyle = "rgba(201,154,58,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx, cy, cellW, cellH, 18); ctx.stroke();

    ctx.font = "36px sans-serif";
    ctx.fillText(s.icon, cx + cellW / 2, cy + 60);
    ctx.fillStyle = "#F4F1E4";
    ctx.font = "700 30px 'JetBrains Mono', monospace";
    ctx.fillText(s.value, cx + cellW / 2, cy + 108);
    ctx.fillStyle = "#96A893";
    ctx.font = "15px 'Inter', sans-serif";
    ctx.fillText(s.label, cx + cellW / 2, cy + 138);
  });

  // QR — white card for scannability, still inside the bottom safe zone
  const qrCardY = gridY + gridH + 55, qrCardSize = 200;
  ctx.fillStyle = "#F4F1E4";
  ctx.beginPath(); ctx.roundRect(W / 2 - qrCardSize / 2 - 16, qrCardY, qrCardSize + 32, qrCardSize + 32, 16); ctx.fill();

  try {
    const qr = await loadImage(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}`);
    ctx.drawImage(qr, W / 2 - qrCardSize / 2, qrCardY + 16, qrCardSize, qrCardSize);
  } catch (e) { /* optional */ }

  ctx.font = "15px 'Inter', sans-serif";
  ctx.fillStyle = "#96A893";
  ctx.fillText("Scan to verify this certificate", W / 2, qrCardY + qrCardSize + 65);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#6E8570";
  ctx.fillText(`#${certId.slice(0, 8)}`, W / 2, qrCardY + qrCardSize + 90);

  return canvas;
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

const POLL_MS = 15000;

export default function App() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [storageError, setStorageError] = useState(null);
  const [session, setSession] = useState(null); // { accessToken, userId }
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    species: "Mehogoni", customSpecies: "", count: "", division: "dhaka",
    place: "", by: "", type: "citizen",
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoValidation, setPhotoValidation] = useState(null); // { status: 'checking'|'valid'|'invalid'|'error', message }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) { setPhotoFile(null); setPhotoPreview(null); setPhotoValidation(null); return; }
    setPhotoValidation({ status: "checking", message: "Checking photo…" });
    try {
      const compressedBlob = await compressImage(file);
      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^.]+$/, "") + ".jpg",
        { type: "image/jpeg" }
      );
      setPhotoFile(compressedFile);
      setPhotoPreview(URL.createObjectURL(compressedBlob));

      const result = await validateTreePhoto(compressedBlob);
      if (result.is_tree) {
        setPhotoValidation({ status: "valid", message: result.confidence === "low" ? "Looks like a tree (low confidence) — allowed." : "Looks like a tree ✓" });
      } else {
        setPhotoValidation({ status: "invalid", message: result.reason || "This doesn't look like a photo of a tree." });
      }
    } catch (err) {
      setPhotoValidation({ status: "error", message: "Couldn't auto-check this photo — you can still submit it." });
    }
  }
  const [toast, setToast] = useState(null);
  const [certEntry, setCertEntry] = useState(null); // entry being certified
  const [certForm, setCertForm] = useState({ email: "", name: "", type: "participation" });
  const [certStatus, setCertStatus] = useState("idle"); // idle | saving | ready | error
  const [certRecord, setCertRecord] = useState(null);
  const [certError, setCertError] = useState(null);
  const formalCanvasRef = useRef(null);
  const socialCanvasRef = useRef(null);

  function openCertModal(entry) {
    setCertEntry(entry);
    setCertForm({ email: "", name: entry.submitted_by_name || "", type: "participation" });
    setCertStatus("idle");
    setCertRecord(null);
    setCertError(null);
  }
  function closeCertModal() {
    setCertEntry(null);
  }

  async function handleIssueCertificate(e) {
    e.preventDefault();
    if (!certForm.email || !certForm.name) return;
    setCertStatus("saving");
    setCertError(null);
    try {
      const record = await insertCertificate({
        planting_id: certEntry.id,
        user_id: certEntry.user_id || null,
        email: certForm.email,
        recipient_name: certForm.name,
        certificate_type: certForm.type,
      });
      setCertRecord(record);
      const verifyUrl = `${VERIFY_BASE_URL}/${record.id}`;
      const date = new Date(certEntry.created_at || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      const divName = DIVISIONS.find(d => d.key === certEntry.division)?.name || certEntry.division;
      const data = {
        name: certForm.name, species: certEntry.species, count: certEntry.count,
        division: divName, date, certId: record.id, verifyUrl,
        verified: certForm.type === "verified_impact",
      };
      await drawFormalCertificate(formalCanvasRef.current, data);
      await drawSocialCertificate(socialCanvasRef.current, data);
      setCertStatus("ready");
    } catch (err) {
      setCertError(String(err.message || err));
      setCertStatus("error");
    }
  }

  async function loadEntries(showSyncing) {
    if (showSyncing) setSyncing(true);
    try {
      const rows = await fetchPlantings();
      setEntries(rows);
      setStorageError(null);
      setLastSynced(new Date());
    } catch (err) {
      setStorageError("Couldn't reach the database — showing last known data.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  useEffect(() => {
    // Reuses a saved session (via localStorage) so "which entries are mine" — and
    // therefore certificate access — persists across page reloads on the real
    // deployed site. In this Claude artifact preview, localStorage is blocked, so
    // it falls back to a fresh anonymous session each time (expected here).
    const stored = loadStoredSession();
    if (stored) {
      setSession(stored);
    } else {
      signInAnon()
        .then(s => { setSession(s); storeSession(s); })
        .catch(err => setStorageError(err.message));
    }
    loadEntries(false);
    const interval = setInterval(() => loadEntries(true), POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const visibleEntries = entries.filter(e => e.verification_status !== "rejected");
  const total = visibleEntries.reduce((s, e) => s + e.count, 0);
  const displayTotal = useCountUp(total);
  const pctOfTarget = (total / TARGET) * 100;
  const pctOfPhase1 = Math.min(100, (total / PHASE1_TARGET) * 100);
  const maxDivisionCount = Math.max(...DIVISIONS.map(d =>
    visibleEntries.filter(e => e.division === d.key).reduce((s, e) => s + e.count, 0)
  ), 1);

  async function handleSubmit(e) {
    e.preventDefault();
    const count = parseInt(form.count, 10);
    if (!count || count <= 0) {
      setToast("Enter a number of trees greater than 0.");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    if (!session) {
      setToast("Still connecting — try again in a moment. (If this repeats, anonymous sign-in may not be enabled in Supabase Auth settings.)");
      setTimeout(() => setToast(null), 4000);
      return;
    }

    setSubmitting(true);
    const species = form.species === "Other" ? (form.customSpecies || "Unspecified") : form.species;

    try {
      if (photoFile && photoValidation?.status === "checking") {
        setToast("Still checking your photo — try again in a second.");
        return;
      }
      if (photoFile && photoValidation?.status === "invalid") {
        setToast(`Photo not accepted: ${photoValidation.message} Please upload a clear photo of the tree, or remove the photo to submit without it.`);
        return;
      }

      // Geolocation is best-effort: denied/unavailable/blocked (common in sandboxed
      // previews) just means the entry stays unverified — it never blocks submission
      // unless a photo was attached, since photo+location together = verified.
      const geo = await getGeolocation();

      if (geo) {
        const inBangladesh = geo.lat >= BD_BOUNDS.minLat && geo.lat <= BD_BOUNDS.maxLat &&
                              geo.lng >= BD_BOUNDS.minLng && geo.lng <= BD_BOUNDS.maxLng;
        if (!inBangladesh) {
          setToast("Your device location doesn't fall within Bangladesh — submission blocked.");
          return;
        }
      }
      if (photoFile && !geo) {
        setToast("Couldn't get your location (common in this preview — works on the real deployed site). Submitting without the photo so it still goes through, unverified.");
      }
      let divisionMismatchWarning = false;
      if (geo && photoFile && !divisionMatches(form.division, geo.lat, geo.lng)) {
        divisionMismatchWarning = true;
      }

      let photoUrl = null;
      if (photoFile && geo) {
        try {
          photoUrl = await uploadPhoto(session.accessToken, session.userId, photoFile);
        } catch (err) {
          setToast("Photo upload failed — submitting without it (unverified).");
        }
      }

      const payload = {
        user_id: session.userId,
        species,
        count,
        division: form.division,
        district: form.place || null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        photo_url: photoUrl,
        submitted_by_name: form.by || "Anonymous",
        submitter_type: form.type,
      };

      const saved = await insertPlanting(session.accessToken, payload);
      setEntries(prev => [saved, ...prev]);
      setForm(f => ({ ...f, count: "", place: "", by: "" }));
      setPhotoFile(null); setPhotoPreview(null); setPhotoValidation(null);
      setStorageError(null);
      setLastSynced(new Date());
      let statusNote = "";
      if (saved.verification_status === "verified") statusNote = " — verified! 🎉";
      else if (saved.verification_status === "flagged" && divisionMismatchWarning) {
        statusNote = ` — your device location didn't match ${DIVISIONS.find(d => d.key === form.division)?.name}, so this was flagged for review instead of verified.`;
      } else if (saved.verification_status === "flagged") {
        statusNote = saved.verification_note ? ` — flagged: ${saved.verification_note}` : " — flagged for review.";
      }
      setToast(`Logged ${formatBD(count)} ${species} in ${DIVISIONS.find(d => d.key === form.division).name}${statusNote}`);
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes("row-level security") || msg.includes("permission")) {
        setToast("Daily submission limit reached for this session (max 5/day).");
      } else {
        setToast(`Couldn't save: ${msg.slice(0, 120)}`);
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(null), 4500);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#EDEEE2", color: "#16221A", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .display { font-family: 'Space Grotesk', sans-serif; }
        input:focus, select:focus, button:focus-visible {
          outline: 2px solid #5B8C51; outline-offset: 2px;
        }
        ::placeholder { color: #8B9A8A; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .app-main {
          display: grid;
          grid-template-columns: minmax(280px, 380px) 1fr;
          gap: 24px;
        }
        .groves-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-auto-rows: 92px;
          gap: 10px;
        }
        .grove-tile {
          grid-column: var(--col) / span var(--span);
          grid-row: var(--row) / span var(--rowspan);
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid #DCE0D2;
          background: #fff;
        }

        @media (max-width: 860px) {
          .app-main {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .groves-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: 76px;
          }
          .grove-tile {
            grid-column: span 1 !important;
            grid-row: span 1 !important;
          }
        }
      `}</style>

      {/* Header */}
      <header style={{ background: "#1F3D2B", color: "#EDEEE2", padding: "28px 20px 32px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <TreeDeciduous size={22} color="#C99A3C" />
            <span className="display" style={{ fontSize: 14, letterSpacing: 1.5, textTransform: "uppercase", color: "#C99A3C" }}>
              National Tree Plantation Tracker
            </span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, margin: "0 0 6px", lineHeight: 1.1 }}>
            25 crore trees, five years.
          </h1>
          <p style={{ margin: "0 0 24px", color: "#B9C4B6", fontSize: 15, maxWidth: 520 }}>
            Tracking progress toward the government's national plantation target, upazila by upazila.
          </p>

          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 700, color: "#EDEEE2" }}>
              {formatBD(displayTotal)}
            </span>
            <span style={{ fontSize: 16, color: "#B9C4B6" }}>
              of {formatBD(TARGET)} trees logged
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "visible" }}>
              <div style={{
                width: `${Math.max(0.4, pctOfTarget)}%`, height: "100%",
                background: "linear-gradient(90deg, #5B8C51, #C99A3C)", borderRadius: 6,
                transition: "width 0.6s ease",
              }} />
              <div style={{
                position: "absolute", left: `${(PHASE1_TARGET / TARGET) * 100}%`, top: -3,
                width: 2, height: 16, background: "#EDEEE2", opacity: 0.6,
              }} title="Phase 1 milestone: 1.5 crore" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "#8FA08A" }}>
              <span className="mono">{pctOfTarget.toFixed(3)}% of 5-year target</span>
              <span className="mono">{pctOfPhase1.toFixed(1)}% of Phase 1 (1.5cr)</span>
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 11.5, color: storageError ? "#E0A860" : "#8FA08A", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: storageError ? "#E0A860" : syncing ? "#C99A3C" : "#5B8C51",
              display: "inline-block",
            }} />
            {storageError
              ? storageError
              : syncing
                ? "Syncing shared data…"
                : lastSynced
                  ? `Synced with all users · ${lastSynced.toLocaleTimeString()}`
                  : "Connecting…"}
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "60px 20px", textAlign: "center", color: "#6B7568", fontSize: 14 }}>
          Loading shared plantation data…
        </div>
      ) : (
      <main className="app-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 16px 60px" }}>

        {/* Form */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 22, border: "1px solid #DCE0D2", height: "fit-content" }}>
          <h2 className="display" style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <Sprout size={18} color="#5B8C51" /> Log a planting
          </h2>
          <p style={{ fontSize: 12.5, color: "#6B7568", margin: "0 0 18px" }}>
            Anonymous by default — location is checked against Bangladesh, and entries start unverified until an official confirms them.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Species">
              <select value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))} style={selectStyle}>
                {SPECIES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            {form.species === "Other" && (
              <Field label="Specify species">
                <input value={form.customSpecies} onChange={e => setForm(f => ({ ...f, customSpecies: e.target.value }))} style={inputStyle} placeholder="e.g. Koroi" />
              </Field>
            )}
            <Field label="Number of trees">
              <input type="number" min="1" required value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value }))} style={inputStyle} placeholder="e.g. 500" />
            </Field>
            <Field label="Division">
              <select value={form.division} onChange={e => setForm(f => ({ ...f, division: e.target.value }))} style={selectStyle}>
                {DIVISIONS.map(d => <option key={d.key} value={d.key}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="District / upazila (optional)">
              <input value={form.place} onChange={e => setForm(f => ({ ...f, place: e.target.value }))} style={inputStyle} placeholder="e.g. Tangail Sadar" />
            </Field>
            <Field label="Photo of planted trees — optional (only needed for the Verified certificate)">
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ fontSize: 12.5 }} />
              {photoPreview && (
                <img src={photoPreview} alt="preview" style={{ marginTop: 8, width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, border: "1px solid #DCE0D2" }} />
              )}
              {photoValidation && (
                <div style={{
                  marginTop: 6, display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, fontWeight: 500,
                  color: photoValidation.status === "valid" ? "#2E6B3E" : photoValidation.status === "invalid" ? "#B84A3A" : "#6B7568",
                }}>
                  {photoValidation.status === "checking" && <Loader2 size={13} className="spin" style={{ flexShrink: 0, marginTop: 1 }} />}
                  {photoValidation.status === "valid" && <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
                  {photoValidation.status === "invalid" && <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{photoValidation.message}</span>
                </div>
              )}
            </Field>
            <Field label="Submitted by">
              <input value={form.by} onChange={e => setForm(f => ({ ...f, by: e.target.value }))} style={inputStyle} placeholder="Your name or organisation" />
            </Field>
            <Field label="Submitter type">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SUBMITTER_TYPES.map(t => {
                  const Icon = t.icon;
                  const active = form.type === t.key;
                  return (
                    <button type="button" key={t.key} onClick={() => setForm(f => ({ ...f, type: t.key }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8,
                        border: active ? "1.5px solid #5B8C51" : "1.5px solid #DCE0D2",
                        background: active ? "#EEF4EA" : "#fff", color: "#16221A",
                        fontSize: 12.5, cursor: "pointer",
                      }}>
                      <Icon size={14} color={active ? "#5B8C51" : "#8B9A8A"} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <button type="submit" disabled={submitting || photoValidation?.status === "checking"} style={{
              marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: (submitting || photoValidation?.status === "checking") ? "#4A5347" : "#1F3D2B", color: "#EDEEE2", border: "none", borderRadius: 9,
              padding: "12px 16px", fontSize: 14.5, fontWeight: 600, cursor: (submitting || photoValidation?.status === "checking") ? "default" : "pointer",
            }}>
              <Plus size={16} /> {submitting ? "Checking & saving…" : photoValidation?.status === "checking" ? "Checking photo…" : "Log planting"}
            </button>
          </form>
        </section>

        {/* Groves grid */}
        <section>
          <h2 className="display" style={{ fontSize: 17, fontWeight: 600, margin: "0 0 2px" }}>The Groves</h2>
          <p style={{ fontSize: 12.5, color: "#6B7568", margin: "0 0 14px" }}>
            Trees logged by division, schematic layout (not to scale).
          </p>
          <div className="groves-grid" style={{ marginBottom: 26 }}>
            {DIVISIONS.map(d => {
              const count = visibleEntries.filter(e => e.division === d.key).reduce((s, e) => s + e.count, 0);
              const fillPct = Math.max(6, (count / maxDivisionCount) * 100);
              const rowSpan = d.key === "dhaka" || d.key === "chattogram" ? 2 : 1;
              return (
                <div key={d.key} className="grove-tile" style={{
                  "--col": d.col, "--row": d.row, "--span": d.span, "--rowspan": rowSpan,
                }}>
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: `${fillPct}%`,
                    background: "linear-gradient(180deg, #7FAE6E, #4A7A40)", transition: "height 0.6s ease",
                  }} />
                  <div style={{ position: "relative", padding: "8px 10px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: fillPct > 55 ? "#fff" : "#16221A" }}>{d.name}</span>
                    <span className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: fillPct > 55 ? "#fff" : "#16221A" }}>
                      {formatBD(count)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent log */}
          <h2 className="display" style={{ fontSize: 17, fontWeight: 600, margin: "0 0 10px" }}>Recent submissions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
            {entries.map(e => {
              const t = SUBMITTER_TYPES.find(t => t.key === e.submitter_type) || SUBMITTER_TYPES[0];
              const Icon = t.icon;
              const div = DIVISIONS.find(d => d.key === e.division);
              const status = STATUS_STYLES[e.verification_status] || STATUS_STYLES.unverified;
              const when = e.created_at ? new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
              return (
                <div key={e.id} style={{
                  background: "#fff", border: "1px solid #DCE0D2", borderRadius: 10, padding: "10px 14px",
                  opacity: e.verification_status === "rejected" ? 0.5 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: "#EEF4EA",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon size={15} color="#5B8C51" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {e.species} <span style={{ fontWeight: 400, color: "#6B7568" }}>· {t.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: status.color, background: status.bg, padding: "2px 7px", borderRadius: 20 }}
                          title={e.verification_note || ""}>
                          {status.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#4A5347", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={12} color="#5B8C51" /> {div?.name}{e.district ? `, ${e.district}` : ""} · {when}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#1F3D2B", flexShrink: 0 }}>
                      +{formatBD(e.count)}
                    </div>
                  </div>
                  {session && e.user_id === session.userId && (
                    <button onClick={() => openCertModal(e)} style={{
                      marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      background: "#FBF3E0", border: "1.5px solid #E3C583", borderRadius: 8,
                      padding: "9px 12px", cursor: "pointer", color: "#8A6318", fontSize: 13, fontWeight: 600,
                    }}>
                      <Award size={15} /> Get your certificate
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      )}

      {certEntry && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(22,34,26,0.55)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16,
        }} onClick={closeCertModal}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%",
            maxHeight: "90vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: certStatus === "ready" ? "none" : "block" }}>
              <h2 className="display" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Get your certificate</h2>
              <p style={{ fontSize: 12.5, color: "#6B7568", margin: "0 0 18px" }}>
                For {formatBD(certEntry.count)} {certEntry.species} logged in {DIVISIONS.find(d => d.key === certEntry.division)?.name}.
              </p>
              <form onSubmit={handleIssueCertificate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Your name (as it should appear)">
                  <input required value={certForm.name} onChange={e => setCertForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Full name" />
                </Field>
                <Field label="Email address">
                  <input required type="email" value={certForm.email} onChange={e => setCertForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} placeholder="you@example.com" />
                </Field>
                <Field label="Certificate type">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 400, alignItems: "center" }}>
                      <input type="radio" checked={certForm.type === "participation"} onChange={() => setCertForm(f => ({ ...f, type: "participation" }))} />
                      Certificate of Participation
                    </label>
                    <label style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 400, alignItems: "center", opacity: certEntry.verification_status === "verified" ? 1 : 0.45 }}>
                      <input type="radio" disabled={certEntry.verification_status !== "verified"}
                        checked={certForm.type === "verified_impact"} onChange={() => setCertForm(f => ({ ...f, type: "verified_impact" }))} />
                      Certificate of Verified Impact {certEntry.verification_status !== "verified" && "(needs a photo + location on the original entry)"}
                    </label>
                    {certEntry.verification_status === "flagged" && (
                      <p style={{ fontSize: 11.5, color: "#B8792A", margin: "2px 0 0", background: "#FBEFDD", padding: "8px 10px", borderRadius: 6 }}>
                        This entry was flagged instead of verified{certEntry.verification_note ? `: ${certEntry.verification_note}` : "."} A Participation certificate is still available.
                      </p>
                    )}
                  </div>
                </Field>
                {certError && <p style={{ fontSize: 12, color: "#B84A3A", margin: 0 }}>{certError}</p>}
                <button type="submit" disabled={certStatus === "saving"} style={{
                  background: "#1F3D2B", color: "#EDEEE2", border: "none", borderRadius: 9,
                  padding: "12px 16px", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
                }}>
                  {certStatus === "saving" ? "Generating…" : "Generate certificate"}
                </button>
                <button type="button" onClick={closeCertModal} style={{
                  background: "none", border: "none", color: "#8B9A8A", fontSize: 12.5, cursor: "pointer",
                }}>Cancel</button>
              </form>
            </div>

            <div style={{ display: certStatus === "ready" ? "block" : "none" }}>
              <h2 className="display" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>🎉 Your certificate is ready</h2>
              <p style={{ fontSize: 12, color: "#6B7568", margin: "0 0 10px" }}>Formal document:</p>
              <canvas ref={formalCanvasRef} style={{ width: "100%", border: "1px solid #DCE0D2", borderRadius: 8, marginBottom: 8 }} />
              <button onClick={() => downloadCanvas(formalCanvasRef.current, `certificate-${certRecord?.id.slice(0,8)}-formal.png`)} style={downloadBtnStyle}>Download formal certificate</button>

              <p style={{ fontSize: 12, color: "#6B7568", margin: "18px 0 10px" }}>Social share card:</p>
              <canvas ref={socialCanvasRef} style={{ width: "60%", display: "block", margin: "0 auto", border: "1px solid #DCE0D2", borderRadius: 8, marginBottom: 8 }} />
              <button onClick={() => downloadCanvas(socialCanvasRef.current, `certificate-${certRecord?.id.slice(0,8)}-social.png`)} style={downloadBtnStyle}>Download social card</button>

              <button type="button" onClick={closeCertModal} style={{
                marginTop: 14, width: "100%", background: "none", border: "1px solid #DCE0D2",
                color: "#4A5347", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, cursor: "pointer",
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1F3D2B", color: "#EDEEE2", padding: "12px 20px", borderRadius: 10,
          fontSize: 13.5, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 50,
          maxWidth: "min(90vw, 420px)", textAlign: "center", lineHeight: 1.4,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 600, color: "#4A5347" }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #DCE0D2",
  fontSize: 13.5, fontFamily: "'Inter', sans-serif", color: "#16221A",
};
const selectStyle = { ...inputStyle, background: "#fff" };
const downloadBtnStyle = {
  width: "100%", background: "#EEF4EA", border: "1px solid #C9DAC2", color: "#1F3D2B",
  borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
