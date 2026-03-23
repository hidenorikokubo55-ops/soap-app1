// pages/index.js
import Head from "next/head";
import { useState, useRef, useEffect } from "react";
import styles from "../styles/Home.module.css";

// ─── 歯式データ ───────────────────────────────────────────
const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const TOOTH_STATES = ["", "affected", "treated", "missing"];
const TOOTH_LABELS = { affected:"患部", treated:"処置済", missing:"欠損" };

function calcAge(dob) {
  if (!dob) return "";
  const b = new Date(dob), t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age + "歳";
}

// ─── メインコンポーネント ─────────────────────────────────
export default function Home() {
  // 患者情報
  const [pat, setPat] = useState({ name:"", kana:"", dob:"", gender:"", id:"", date: new Date().toISOString().slice(0,10), doctor:"", insurance:"", history:"" });
  // 歯式
  const [toothState, setToothState] = useState({});
  // 音声
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState("タップして録音開始");
  const [audioURL, setAudioURL] = useState(null);
  // テキスト
  const [transcript, setTranscript] = useState("");
  // SOAP
  const [soap, setSoap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 履歴
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("input"); // "input" | "history"
  // トースト
  const [toast, setToast] = useState({ msg:"", type:"" });

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // ─── トースト ───────────────────────────────────────────
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:"", type:"" }), type === "success" ? 2500 : 5000);
  }

  // ─── 歯式 ───────────────────────────────────────────────
  function cycleTooth(num) {
    setToothState(prev => {
      const cur = prev[num] || "";
      const idx = TOOTH_STATES.indexOf(cur);
      const next = TOOTH_STATES[(idx + 1) % TOOTH_STATES.length];
      return { ...prev, [num]: next };
    });
  }

  function getAffectedTeeth() {
    return Object.entries(toothState)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}(${TOOTH_LABELS[v]})`)
      .join(", ");
  }

  // ─── 録音 ───────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
      mediaRecRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];
      mediaRecRef.current.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mediaRecRef.current.onstop = handleRecordingStop;
      mediaRecRef.current.start(1000);
      setIsRecording(true);
      setRecSeconds(0);
      setVoiceStatus("録音中… タップで停止");
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (err) {
      if (err.name === "NotAllowedError") {
        showToast("マイクの使用を許可してください（設定 → Safari → マイク）", "error");
      } else {
        showToast("録音できません。テキストを直接入力してください。", "error");
      }
    }
  }

  function stopRecording() {
    if (mediaRecRef.current) {
      mediaRecRef.current.stop();
      mediaRecRef.current.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
    setVoiceStatus("文字起こし中...");
  }

  async function handleRecordingStop() {
    const mimeType = chunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    setAudioURL(URL.createObjectURL(blob));
    await sendToWhisper(blob, mimeType);
  }

  async function sendToWhisper(blob, mimeType) {
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("audio", blob, `rec.${ext}`);
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTranscript(prev => (prev ? prev + "\n" : "") + data.text);
      showToast("文字起こし完了");
    } catch (e) {
      showToast("文字起こし失敗。テキストを直接入力してください。", "error");
    }
    setVoiceStatus("タップして録音開始");
  }

  async function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAudioURL(URL.createObjectURL(file));
    setVoiceStatus("文字起こし中...");
    await sendToWhisper(file, file.type);
  }

  // ─── SOAP生成 ───────────────────────────────────────────
  async function analyzeSOAP() {
    if (!transcript.trim()) { showToast("テキストを入力してください", "error"); return; }
    setLoading(true);
    setError("");
    setSoap(null);

    const ctx = [
      pat.name && `患者名：${pat.name}`,
      pat.dob && `年齢：${calcAge(pat.dob)}`,
      pat.gender && `性別：${pat.gender}`,
      getAffectedTeeth() && `歯式：${getAffectedTeeth()}`,
      pat.history && `既往歴：${pat.history}`,
    ].filter(Boolean).join("\n");

    try {
      const res = await fetch("/api/soap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, patientContext: ctx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSoap(data.soap);
    } catch (e) {
      setError("エラー: " + e.message);
    }
    setLoading(false);
  }

  // ─── 履歴保存 ───────────────────────────────────────────
  function saveToHistory() {
    if (!soap) return;
    const entry = {
      id: Date.now(), ...pat,
      teeth: getAffectedTeeth(),
      transcript,
      soap: { ...soap },
    };
    setHistory(prev => [entry, ...prev]);
    showToast("履歴に保存しました");
  }

  // ─── 印刷 ───────────────────────────────────────────────
  function printEntry(e) {
    const html = buildPrintHTML(e);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildPrintHTML(e) {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>歯科診療録 - ${e.name||""}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Noto Sans JP',sans-serif;font-size:11pt;color:#111;margin:15mm}
h1{font-family:'Noto Serif JP',serif;font-size:15pt;color:#2d6a4f;border-bottom:2px solid #2d6a4f;padding-bottom:6px;margin-bottom:12px}
.meta{font-size:10pt;color:#555;margin-bottom:18px}
.meta div{margin-bottom:3px}
.s{border:1px solid #ccc;border-radius:6px;margin-bottom:12px;overflow:hidden;page-break-inside:avoid}
.sh{padding:6px 12px;font-weight:700;font-size:10pt}
.ss .sh{background:#e3f2fd;color:#1565c0}.so .sh{background:#e8f5e9;color:#2e7d32}
.sa .sh{background:#fff3e0;color:#e65100}.sp .sh{background:#f3e5f5;color:#6a1b9a}
.sb{padding:10px 12px;line-height:1.8;white-space:pre-wrap;font-size:10.5pt}
</style></head><body>
<h1>歯科診療録</h1>
<div class="meta">
<div><b>患者氏名：</b>${e.name||"—"}${e.dob?" / "+calcAge(e.dob):""}${e.gender?" / "+e.gender:""}</div>
<div><b>診療日：</b>${e.date||"—"}</div>
${e.id?`<div><b>患者ID：</b>${e.id}</div>`:""}
${e.doctor?`<div><b>担当医：</b>${e.doctor}</div>`:""}
${e.insurance?`<div><b>保険：</b>${e.insurance}</div>`:""}
${e.teeth?`<div><b>歯式：</b>${e.teeth}</div>`:""}
</div>
${[["S","主訴・主観的情報","ss"],["O","客観的情報・所見","so"],["A","評価・診断","sa"],["P","治療計画","sp"]].map(([l,n,c])=>`
<div class="s ${c}"><div class="sh">${l} — ${n}</div><div class="sb">${e.soap[l]||"記録なし"}</div></div>`).join("")}
</body></html>`;
  }

  // ─── UI ─────────────────────────────────────────────────
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const toothClass = (num) => {
    const s = toothState[num] || "";
    if (s === "affected") return styles.toothAffected;
    if (s === "treated") return styles.toothTreated;
    if (s === "missing") return styles.toothMissing;
    return "";
  };

  return (
    <>
      <Head>
        <title>歯科 SOAP カルテ AI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="歯科カルテAI" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>歯科 SOAP カルテ AI</div>
        <button className={styles.hdrBtn} onClick={() => window.print()}>印刷</button>
      </header>

      {/* Tabs */}
      <nav className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "input" ? styles.tabActive : ""}`} onClick={() => setTab("input")}>新規カルテ作成</button>
        <button className={`${styles.tab} ${tab === "history" ? styles.tabActive : ""}`} onClick={() => setTab("history")}>
          カルテ履歴 {history.length > 0 && <span className={styles.badge}>{history.length}</span>}
        </button>
      </nav>

      {/* ── INPUT TAB ─────────────────────────────────────── */}
      {tab === "input" && (
        <main className={styles.main}>

          {/* 患者情報 */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>患者情報</div>
            <div className={styles.cardBody}>
              <div className={styles.formGrid}>
                {[
                  ["患者氏名","name","text","山田 太郎"],
                  ["カナ","kana","text","ヤマダ タロウ"],
                  ["生年月日","dob","date",""],
                  ["患者ID","id","text","PT-0001"],
                  ["診療日","date","date",""],
                  ["担当医","doctor","text",""],
                ].map(([label, key, type, ph]) => (
                  <div key={key} className={styles.formGroup}>
                    <label className={styles.fLabel}>{label}</label>
                    <input type={type} placeholder={ph} value={pat[key]} onChange={e => setPat(p => ({...p, [key]: e.target.value}))} />
                  </div>
                ))}
                <div className={styles.formGroup}>
                  <label className={styles.fLabel}>性別</label>
                  <select value={pat.gender} onChange={e => setPat(p => ({...p, gender: e.target.value}))}>
                    <option value="">——</option>
                    {["男性","女性","その他"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.fLabel}>保険種別</label>
                  <select value={pat.insurance} onChange={e => setPat(p => ({...p, insurance: e.target.value}))}>
                    <option value="">——</option>
                    {["社会保険","国民健康保険","後期高齢者医療","労災","自費"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className={`${styles.formGroup} ${styles.wide}`}>
                  <label className={styles.fLabel}>既往歴・アレルギー</label>
                  <input type="text" placeholder="例：高血圧、ペニシリンアレルギー" value={pat.history} onChange={e => setPat(p => ({...p, history: e.target.value}))} />
                </div>
              </div>

              {/* 歯式チャート */}
              <div className={styles.toothChart}>
                <div className={styles.toothChartLabel}>歯式チャート（タップでマーク）</div>
                <div className={styles.toothScroll}>
                  {[UPPER, LOWER].map((row, ri) => (
                    <div key={ri} className={styles.jawRow}>
                      <span className={styles.jawLabel}>{ri === 0 ? "上" : "下"}</span>
                      {row.slice(0, 8).map(n => (
                        <button key={n} className={`${styles.tooth} ${toothClass(n)}`} onClick={() => cycleTooth(n)}>{n}</button>
                      ))}
                      <span className={styles.jawDivider} />
                      {row.slice(8).map(n => (
                        <button key={n} className={`${styles.tooth} ${toothClass(n)}`} onClick={() => cycleTooth(n)}>{n}</button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className={styles.toothLegend}>
                  {[["#fff3e0","#b5541a","患部"],["#e8f5e9","#2d6a4f","処置済"],["#fce4ec","#e91e63","欠損"]].map(([bg,bd,l]) => (
                    <span key={l} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{background:bg, border:`1px solid ${bd}`}} />
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 音声入力 */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>音声入力</div>

            <div className={styles.voiceControls}>
              <button
                className={`${styles.recordBtn} ${isRecording ? styles.recordBtnActive : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording
                  ? <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M6 6h12v12H6z"/></svg>
                  : <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 14.93A7 7 0 0 1 5 9H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.07z"/></svg>
                }
              </button>
              <div>
                <div className={`${styles.voiceStatus} ${isRecording ? styles.voiceStatusRec : ""}`}>{voiceStatus}</div>
                <div className={styles.voiceTimer}>{fmtTime(recSeconds)}</div>
              </div>
            </div>

            {/* Upload */}
            <label className={styles.uploadZone}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{color:"var(--text-muted)",display:"block",margin:"0 auto 6px"}}><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
              <p>音声ファイルをアップロード</p>
              <small>MP3 / WAV / M4A 対応</small>
              <input type="file" accept="audio/*" onChange={handleAudioUpload} style={{display:"none"}} />
            </label>

            {audioURL && (
              <div style={{padding:"0 20px 12px"}}>
                <audio controls src={audioURL} style={{width:"100%",borderRadius:6}} />
              </div>
            )}

            <div className={styles.transcriptSection}>
              <label className={styles.fLabel} style={{display:"block",marginBottom:8}}>文字起こし / 診療メモ（編集可能）</label>
              <textarea
                className={styles.transcriptArea}
                rows={8}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder={"録音後ここに文字起こしが表示されます。\nまたは直接入力してください。\n\n例：\n患者は右下6番が3日前から痛いと来院。咬合痛あり。打診痛+。X線にて根尖部透過像確認。本日開放創処置、抗生剤処方。次回根管治療予定。"}
              />
              <button className={styles.analyzeBtn} onClick={analyzeSOAP} disabled={loading}>
                {loading
                  ? <><span className={styles.spinner} /> AIが分析中...</>
                  : "SOAP形式でAI分析・カルテ生成"}
              </button>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
          </section>

          {/* SOAP出力 */}
          {(soap || loading) && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>SOAP カルテ出力</div>
              <div className={styles.cardBody}>
                <div className={styles.soapGrid}>
                  {[
                    ["S", "Subjective", "主訴・主観的情報", styles.soapS, styles.letterS],
                    ["O", "Objective",  "客観的情報・所見",  styles.soapO, styles.letterO],
                    ["A", "Assessment","評価・診断",         styles.soapA, styles.letterA],
                    ["P", "Plan",       "治療計画",           styles.soapP, styles.letterP],
                  ].map(([l, en, jp, cardCls, letCls]) => (
                    <div key={l} className={`${styles.soapCard} ${cardCls}`}>
                      <div className={styles.soapCardHeader}>
                        <span className={`${styles.soapLetter} ${letCls}`}>{l}</span>
                        <div>
                          <div className={styles.soapCardLabel}>{en}</div>
                          <div className={styles.soapCardSublabel}>{jp}</div>
                        </div>
                      </div>
                      <div className={styles.soapCardBody}>
                        {loading
                          ? <><div className={styles.skeleton} style={{width:"90%"}} /><div className={styles.skeleton} style={{width:"75%"}} /><div className={styles.skeleton} style={{width:"82%"}} /></>
                          : <pre className={styles.soapContent}>{soap?.[l] || "記録なし"}</pre>
                        }
                      </div>
                    </div>
                  ))}
                </div>
                {soap && (
                  <div className={styles.soapActions}>
                    <button className={styles.btnSm} onClick={saveToHistory}>履歴に保存</button>
                    <button className={styles.btnSm} onClick={() => printEntry({...pat, teeth: getAffectedTeeth(), soap})}>印刷 / PDF</button>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      )}

      {/* ── HISTORY TAB ───────────────────────────────────── */}
      {tab === "history" && (
        <main className={styles.main}>
          {history.length === 0 ? (
            <div className={styles.emptyHistory}>
              <p>まだ保存されたカルテがありません。</p>
              <p style={{marginTop:8,fontSize:13}}>新規カルテ作成から生成し「履歴に保存」してください。</p>
            </div>
          ) : (
            history.map(e => (
              <div key={e.id} className={`${styles.card} ${styles.historyItem}`}>
                <div className={styles.historyHeader}>
                  <div>
                    <span className={styles.historyDate}>{e.date}</span>
                    <span className={styles.historyName}>{e.name || "（氏名未入力）"}{e.dob ? " / " + calcAge(e.dob) : ""}{e.gender ? " / " + e.gender : ""}</span>
                    {(e.id_val || e.doctor) && <span className={styles.historyMeta}>{[e.id_val && "ID: "+e.id_val, e.doctor && "担当: "+e.doctor].filter(Boolean).join("　")}</span>}
                  </div>
                  <div className={styles.historyBtns}>
                    <button className={styles.btnSm} onClick={() => printEntry(e)}>印刷</button>
                    <button className={`${styles.btnSm} ${styles.btnDanger}`} onClick={() => setHistory(h => h.filter(x => x.id !== e.id))}>削除</button>
                  </div>
                </div>
                <div className={styles.historySoap}>
                  {["S","O","A","P"].map(l => (
                    <div key={l} className={styles.hsi}>
                      <div className={`${styles.hsiLabel} ${styles["hsi"+l]}`}>{l}</div>
                      <div className={styles.hsiText}>{e.soap?.[l] || "——"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </main>
      )}

      {/* Toast */}
      {toast.msg && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : toast.type === "warn" ? styles.toastWarn : ""}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
