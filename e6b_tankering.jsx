import { useState, useEffect, useRef } from "react";

const CURRENCIES=[{code:"USD",symbol:"$"},{code:"EUR",symbol:"€"},{code:"GBP",symbol:"£"},{code:"CAD",symbol:"C$"},{code:"AED",symbol:"د.إ"}];
const APP_VERSION="1.43";
const LBS_PER_GAL=6.7,LBS_PER_L=1.77;
const GV={id:"gv",name:"Gulfstream V (GV)",bow:48557,mtow:90500,mlw:75300,mzfw:54500,maxFuel:41300,burnPenaltyFactor:0.04,cruiseBurn:{35000:2200,37000:2050,39000:1900,41000:1780,43000:1680,45000:1600}};
// ── ACN/PCN Data (GV Performance Handbook, Tire Pressure = 198 PSI, WoM = 91%) ──
const ACN_WEIGHTS=[50000,55000,60000,65000,70000,75000,80000,85000,90000,90900];
const ACN_FLEX={
  D:[15.24,16.95,18.66,20.37,22.09,23.80,25.51,27.22,28.93,29.24],
  C:[13.76,15.50,17.24,18.98,20.73,22.48,24.23,25.99,27.74,28.05],
  B:[12.34,13.91,15.54,17.25,18.98,20.77,22.57,24.39,26.21,26.54],
  A:[11.67,13.11,14.60,16.08,17.61,19.25,20.79,22.50,24.26,24.57]
};
const ACN_RIGID={
  D:[16.70,18.60,20.60,22.60,24.60,26.60,28.70,30.80,32.90,33.30],
  C:[16.30,18.20,20.10,22.10,24.10,26.20,28.20,30.30,32.40,32.80],
  B:[15.80,17.70,19.60,21.60,23.60,25.60,27.70,29.80,31.90,32.30],
  A:[15.40,17.20,19.10,21.00,23.00,25.00,27.10,29.20,31.30,31.70]
};
// ── ACR/PCR Data (GV AOM Part 2 Rev 42, Tire Pressure = 198 PSI) ──
const ACR_FLEX_WEIGHTS=[54000,55000,60000,65000,70000,75000,80000,85000,90000,90900];
const ACR_FLEX={
  D:[160.1,164.2,184.7,205.1,225.4,245.7,265.7,285.5,305.3,308.8],
  C:[137,140.2,156,173.7,193.1,212.7,233.2,253.8,274.4,278.1],
  B:[124.6,127.4,141.4,155.8,170.5,185.6,200.9,216.5,233.7,237.2],
  A:[114.4,116.7,128.2,139.8,151.7,163.8,176.2,189.5,203,205.4]
};
const ACR_RIGID_WEIGHTS=[54500,55000,60000,65000,70000,75000,80000,85000,90000,90900];
const ACR_RIGID={
  D:[169.6,173.2,190.9,208.8,226.6,244.7,262.9,281.1,298.9,302.2],
  C:[164.6,168.1,185.6,203.2,221,238.6,256.5,274.5,292.6,295.9],
  B:[159.6,163.1,180.4,197.7,215.2,232.8,250.6,268.1,286,289.2],
  A:[152.7,156,172.8,189.8,206.9,224.2,241.5,259.2,276.7,279.8]
};
const GV_MAX_TIRE_PSI=198;
const TIRE_LIMITS={W:9999,X:254,Y:181,Z:73};
const SUBGRADE_LABELS={D:"Ultra Low",C:"Low",B:"Medium",A:"High"};
const SUBGRADE_CBR={D:"CBR = 3",C:"CBR = 6",B:"CBR = 10",A:"CBR = 15"};
const SUBGRADE_K={D:"k = 20",C:"k = 40",B:"k = 80",A:"k = 150"};
const SUBGRADE_E={D:"E = 7,252",C:"E = 11,603",B:"E = 17,405",A:"E = 29,008"};
const TIRE_LABELS={W:"Unlimited",X:"High (≤254 psi)",Y:"Medium (≤181 psi)",Z:"Low (≤73 psi)"};

function lerp(weights,values,w){
  if(w<=weights[0])return values[0];
  if(w>=weights[weights.length-1])return values[values.length-1];
  for(let i=0;i<weights.length-1;i++){
    if(w>=weights[i]&&w<=weights[i+1]){
      const t=(w-weights[i])/(weights[i+1]-weights[i]);
      return values[i]+t*(values[i+1]-values[i]);
    }
  }
  return values[values.length-1];
}

function parsePcnString(str){
  // Parse "24/F/C/Y/T" or "260/F/D/X/T"
  const parts=str.replace(/\s+/g,"").toUpperCase().split("/");
  if(parts.length<4)return null;
  const num=parseFloat(parts[0]);
  if(isNaN(num))return null;
  const pType=parts[1]==="R"?"R":"F";
  const sub=["A","B","C","D"].includes(parts[2])?parts[2]:"B";
  const tire=["W","X","Y","Z"].includes(parts[3])?parts[3]:"W";
  const cls=parts[4]==="U"?"U":"T";
  return{pcn:num,pavementType:pType,subgrade:sub,tireCat:tire,classification:cls};
}

function getAcn(weight,pavType,subgrade){
  const tbl=pavType==="F"?ACN_FLEX:ACN_RIGID;
  return lerp(ACN_WEIGHTS,tbl[subgrade]||tbl.B,weight);
}
function getAcr(weight,pavType,subgrade){
  const tbl=pavType==="F"?ACR_FLEX:ACR_RIGID;
  const wts=pavType==="F"?ACR_FLEX_WEIGHTS:ACR_RIGID_WEIGHTS;
  return lerp(wts,tbl[subgrade]||tbl.B,weight);
}

// ── 10/24 Flight Duty Time Constants ──────────────────────────────────────
const CREW_LIMITS={
  2:{duty:14,flight:10,rest:10,rolling24:10,label:"2 Pilot",reg:"FAR 135.267"},
  3:{duty:18,flight:12,rest:12,rolling24:12,label:"3 Pilot",reg:"FAR 135.269"},
  4:{duty:20,flight:16,rest:12,rolling24:16,label:"4 Pilot",reg:"FAR 135.269"}
};
const MONTHS={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
const ICAO_TZ={
  // US East (UTC-4 in DST)
  KAPF:-4,KATL:-4,KBDL:-4,KBOS:-4,KBWI:-4,KCHA:-4,KCHS:-4,KCLE:-4,KCLT:-4,KCMH:-4,KDCA:-4,KDTW:-4,KEWR:-4,KFLL:-4,KFXE:-4,KHPN:-4,KIAD:-4,KJAX:-4,KJFK:-4,KLGA:-4,KMCO:-4,KMIA:-4,KOPF:-4,KORF:-4,KPBI:-4,KPHL:-4,KPIT:-4,KPTK:-4,KPVD:-4,KRDU:-4,KRIC:-4,KRSW:-4,KSAV:-4,KTEB:-4,KTMB:-4,KTPA:-4,
  // US Central (UTC-5 in DST)
  KAUS:-5,KBHM:-5,KBNA:-5,KDAL:-5,KDFW:-5,KHOU:-5,KIAH:-5,KICT:-5,KLIT:-5,KMDW:-5,KMEM:-5,KMKE:-5,KMSP:-5,KMSY:-5,KOKC:-5,KOMK:-5,KORD:-5,KSAT:-5,KSTL:-5,KTUL:-5,
  // US Mountain (UTC-6 in DST)
  KABQ:-6,KAPA:-6,KASE:-6,KBIL:-6,KBJC:-6,KBOI:-6,KBZN:-6,KCOS:-6,KCYS:-6,KDEN:-6,KEGE:-6,KELP:-6,KFTG:-6,KGJT:-6,KGTF:-6,KMSO:-6,KPUB:-6,KSLC:-6,
  // US West / Arizona (UTC-7; AZ stays -7 year-round, no DST)
  KBUR:-7,KDVT:-7,KFAT:-7,KFFZ:-7,KGEG:-7,KGEU:-7,KHND:-7,KIWA:-7,KLAS:-7,KLAX:-7,KLGB:-7,KOAK:-7,KONT:-7,KPDX:-7,KPHX:-7,KPSP:-7,KRNO:-7,KSAN:-7,KSDL:-7,KSEA:-7,KSFO:-7,KSJC:-7,KSMF:-7,KSNA:-7,KTUS:-7,KVGT:-7,KVNY:-7,
  // US Alaska / Hawaii
  PANC:-8,PHNL:-10,
  // Canada
  CYYZ:-4,CYUL:-4,CYVR:-7,
  // Caribbean / Central America
  MYNN:-4,MMTO:-5,MMMX:-5,MMUN:-5,MKJS:-5,MKJP:-5,TJSJ:-4,MDPC:-4,MTPP:-5,
  // South America
  SBGR:-3,SBRJ:-3,SCEL:-4,SAEZ:-3,SVMI:-4,SVFM:-4,
  // UK / Iberia
  EGLL:1,EGKK:1,EGSS:1,EGGW:1,EGCC:1,LPPT:0,
  // France / Iberia
  LFPG:1,LFPB:2,LFPO:1,LEMD:1,LEBL:1,
  // Central / Western Europe
  EDDF:1,EDDM:1,EDDB:2,EHAM:1,EBBR:2,LOWW:1,LSZH:1,LSGG:1,
  // Italy
  LIRF:1,LIRA:1,LIPZ:1,LIME:1,LIBD:1,
  // Nordics
  EKCH:1,ENGM:1,ESSA:1,EFHK:2,
  // Eastern Mediterranean / Turkey / Israel
  LGAV:2,LTBA:3,LTFM:3,LLBG:2,
  // Middle East
  OMDB:4,OMAA:4,OTHH:3,OEJN:3,OERK:3,
  // Asia
  VHHH:8,RJTT:9,RJBB:9,RJAA:9,RKSI:9,RCTP:8,WSSS:8,VTBS:7,RPLL:8,
  // Oceania
  YSSY:10,YMML:10,NZAA:12
};

// ── Theme palettes ─────────────────────────────────────────────────────────
// Accent/status colors (accent/green/red/amber/gold) and `light` (text on dark
// surfaces) are identical in both modes; only the surface/text neutrals change.
const C_LIGHT={bg:"#f0f2f5",panel:"#1b2a4a",card:"#ffffff",border:"#d8dce3",accent:"#2563eb",gold:"#d97706",green:"#059669",red:"#dc2626",amber:"#d97706",muted:"#7c8494",text:"#0f172a",sub:"#475569",light:"#ffffff",inputBg:"#e8ebf0"};
const C_DARK={bg:"#0b1220",panel:"#0f1829",card:"#141e30",border:"#1e2d40",accent:"#2563eb",gold:"#d97706",green:"#059669",red:"#dc2626",amber:"#d97706",muted:"#5a7a90",text:"#dce6ee",sub:"#8faabe",light:"#ffffff",inputBg:"#182438"};

// `C` stays a single module-level object referenced everywhere (~770 sites).
// Instead of reassigning it (which would break the module-level captures like
// DUTY_LEG_COLORS), we MUTATE its keys in place so every reference sees the
// active palette. recomputeTheme() is the only writer.
const C={...C_LIGHT};
const THEME_KEY="e6b:theme";
let themeMode="auto"; // "auto" | "light" | "dark"
try{const raw=localStorage.getItem(THEME_KEY);if(raw){const v=JSON.parse(raw);if(v==="light"||v==="dark"||v==="auto")themeMode=v;}}catch{}
const themeListeners=new Set();
function systemPrefersDark(){try{return!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);}catch{return false;}}
function themeIsDark(){return themeMode==="dark"||(themeMode==="auto"&&systemPrefersDark());}
function recomputeTheme(){
  Object.assign(C,themeIsDark()?C_DARK:C_LIGHT);
  try{
    document.documentElement.style.background=C.bg;
    document.body.style.background=C.bg;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute("content",C.panel);
  }catch{}
}
function setThemeMode(mode){themeMode=mode;try{localStorage.setItem(THEME_KEY,JSON.stringify(mode));}catch{}recomputeTheme();themeListeners.forEach(fn=>fn());}
function cycleThemeMode(){setThemeMode(themeMode==="auto"?"light":themeMode==="light"?"dark":"auto");}
recomputeTheme();
try{
  const mq=window.matchMedia("(prefers-color-scheme: dark)");
  const onSys=()=>{recomputeTheme();themeListeners.forEach(fn=>fn());};
  if(mq.addEventListener)mq.addEventListener("change",onSys);else if(mq.addListener)mq.addListener(onSys);
}catch{}
// Subscribe a component to theme changes and keep C in sync for its render.
function useTheme(){
  const[,force]=useState(0);
  useEffect(()=>{const fn=()=>force(n=>n+1);themeListeners.add(fn);return()=>themeListeners.delete(fn);},[]);
  recomputeTheme();
  return{mode:themeMode,isDark:themeIsDark(),cycle:cycleThemeMode};
}
const LEG_COLORS=["#4a7fa5","#5a8f7a","#8a7a5a","#7a5a8a","#4a7a6a","#7a6a4a","#5a6a8a","#8a5a6a"];
// Rotating accent palette used in the 10/24 tab (manual entry leg cards + explanation panel route cards).
// Indexed by global leg position; wraps after the 6th leg.
const DUTY_LEG_COLORS=[C.accent /* blue */,"#0891b2" /* teal */,"#d97706" /* amber */,"#7c3aed" /* purple */,"#059669" /* green */,"#dc2626" /* red */];
const dutyLegColor=i=>DUTY_LEG_COLORS[i%DUTY_LEG_COLORS.length];

const fL=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0})+" lbs";
const fG=n=>(Number(n||0)/LBS_PER_GAL).toLocaleString(undefined,{maximumFractionDigits:0})+" gal";
const fLt=n=>(Number(n||0)/LBS_PER_L).toLocaleString(undefined,{maximumFractionDigits:0})+" L";
const fM=(n,s)=>`${s}${Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// ── Responsive hook ──────────────────────────────────────────────────────
function useWide(bp=768){
  const[wide,setWide]=useState(()=>typeof window!=="undefined"&&window.innerWidth>=bp);
  useEffect(()=>{
    const check=()=>setWide(window.innerWidth>=bp);
    window.addEventListener("resize",check);return()=>window.removeEventListener("resize",check);
  },[bp]);
  return wide;
}

// True when the device likely has a physical keyboard / precise pointer —
// covers desktops AND iPads with an attached keyboard, where the custom
// numpad should yield to direct keyboard typing.
function detectHasKeyboard(){
  if(typeof window==="undefined")return false;
  try{
    return window.innerWidth>=768
      ||(window.matchMedia&&window.matchMedia("(pointer: fine)").matches)
      ||(window.matchMedia&&window.matchMedia("(hover: hover)").matches);
  }catch(e){return window.innerWidth>=768;}
}
function useHasKeyboard(){
  const[has,setHas]=useState(detectHasKeyboard);
  useEffect(()=>{
    const check=()=>setHas(detectHasKeyboard());
    window.addEventListener("resize",check);
    const mqs=[];
    try{
      ["(pointer: fine)","(hover: hover)"].forEach(q=>{
        const m=window.matchMedia(q);
        if(m.addEventListener)m.addEventListener("change",check);
        else if(m.addListener)m.addListener(check);
        mqs.push(m);
      });
    }catch(e){}
    return()=>{
      window.removeEventListener("resize",check);
      mqs.forEach(m=>{if(m.removeEventListener)m.removeEventListener("change",check);else if(m.removeListener)m.removeListener(check);});
    };
  },[]);
  return has;
}

// ── Global Tesseract OCR ─────────────────────────────────────────────────
let _tesseractLoading=false;
function loadTesseract(cb){
  if(window.Tesseract){cb(true);return;}
  if(_tesseractLoading){const iv=setInterval(()=>{if(window.Tesseract){clearInterval(iv);cb(true);}},200);return;}
  _tesseractLoading=true;
  const s=document.createElement("script");
  s.src="https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/tesseract.min.js";
  s.onload=()=>{_tesseractLoading=false;cb(!!window.Tesseract);};
  s.onerror=()=>{_tesseractLoading=false;cb(false);};
  document.head.appendChild(s);
}

async function ocrFromDataUrl(dataUrl,onProgress){
  if(!window.Tesseract)throw new Error("OCR engine not loaded");
  if(onProgress)onProgress("Preparing image...");
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Cannot load image"));i.src=dataUrl;});
  const canvas=document.createElement("canvas");
  canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(img,0,0);
  // Detect if dark background — sample top-left corner
  const sample=ctx.getImageData(0,0,Math.min(50,img.width),Math.min(50,img.height));
  let avgBrightness=0;
  for(let i=0;i<sample.data.length;i+=4)avgBrightness+=(sample.data[i]+sample.data[i+1]+sample.data[i+2])/3;
  avgBrightness/=(sample.data.length/4);
  // If dark bg (< 128), invert for OCR
  let wasDark=false;
  if(avgBrightness<128){
    wasDark=true;
    const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
    const d=imageData.data;
    for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}
    ctx.putImageData(imageData,0,0);
  }
  // Increase contrast — push harder (2.0) on inverted dark-UI screenshots
  // (white-on-dark-teal crew schedules) so faint lines aren't dropped.
  const contrastFactor=wasDark?2.0:1.5;
  const imgData=ctx.getImageData(0,0,canvas.width,canvas.height);
  const dd=imgData.data;
  for(let i=0;i<dd.length;i+=4){
    for(let c=0;c<3;c++){let v=dd[i+c];v=((v/255-0.5)*contrastFactor+0.5)*255;dd[i+c]=Math.max(0,Math.min(255,v));}
  }
  ctx.putImageData(imgData,0,0);
  const processedUrl=canvas.toDataURL("image/png");
  if(onProgress)onProgress("Running OCR (first time may take a moment)...");
  // Use jsdelivr CDN with directory path (not specific file)
  const worker=await window.Tesseract.createWorker("eng",1,{
    workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/worker.min.js",
    corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1",
  });
  // Add timeout
  const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error("OCR timed out after 60s")),60000));
  const recognize=worker.recognize(processedUrl);
  const result=await Promise.race([recognize,timeout]);
  await worker.terminate();
  return result.data.text;
}

async function ocrFromFile(file,onProgress){
  const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error("Cannot read file"));r.readAsDataURL(file);});
  return ocrFromDataUrl(dataUrl,onProgress);
}

async function store(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
async function recall(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}}
async function forget(k){try{localStorage.removeItem(k);}catch{}}

function newLeg(from=""){return{from,to:"",distNm:"",plannedBurnLbs:"",cruiseAltFt:"",depPrice:"",arrPrice:"",depRampFee:"",depMinPurchase:"",arrFuelAvail:true,payload:"",fobOverride:"",useOverride:false};}

function getBurn(ac,alt){
  if(ac.id==="gv"){const alts=Object.keys(GV.cruiseBurn).map(Number).sort((a,b)=>a-b);const near=alts.reduce((a,b)=>Math.abs(b-alt)<Math.abs(a-alt)?b:a);return GV.cruiseBurn[near];}
  return Number(ac.customBurnRate||2000);
}

function calcLeg(ac,leg,globalAlt,reserveFuel,fobAtDep,nextLeg){
  const plannedBurn=Number(leg.plannedBurnLbs||0);
  const alt=Number(leg.cruiseAltFt||globalAlt||39000);
  const dist=Number(leg.distNm||500);
  const tas=alt>35000?470:420;
  const hrs=dist/tas;
  const calcBurn=getBurn(ac,alt)*hrs;
  const baseBurn=plannedBurn>0?plannedBurn:calcBurn;
  const reserve=Number(reserveFuel||3000);
  const tripFuel=baseBurn+reserve;
  const payload=Number(leg.payload||0);
  const bow=Number(ac.bow||48557),zfw=bow+payload;
  const fob=Number(fobAtDep||0);
  const maxTOFuel=Math.min(Number(ac.maxFuel||41300),Number(ac.mtow||90500)-zfw);
  const maxExtra=Math.max(0,maxTOFuel-fob-tripFuel);
  const fobCoversTrip=fob>=tripFuel;
  const depP=Number(leg.depPrice||0),arrP=Number(leg.arrPrice||0);
  const priceDiff=arrP-depP;
  // Arrival ramp fee comes from the NEXT leg's departure FBO
  const arrRampFee=nextLeg?Number(nextLeg.depRampFee||0):0;
  const arrMinPurLbs=nextLeg?Number(nextLeg.depMinPurchase||0)*LBS_PER_GAL:0;
  // This leg's departure ramp fee
  const depRampFee=Number(leg.depRampFee||0);
  const depMinPurLbs=Number(leg.depMinPurchase||0)*LBS_PER_GAL;
  const penFactor=Number(ac.burnPenaltyFactor||0.04);
  const breakEven=penFactor*hrs*depP;
  let tankerLbs=0,decision="",savings=0,weightWarning="",note="";

  if(leg.arrFuelAvail===false){
    tankerLbs=Math.min(maxExtra,tripFuel);
    decision="MUST TANKER";note="No fuel at destination";
  }else if(fobCoversTrip&&maxExtra<=0){
    decision="NO PURCHASE";note=`FOB ${fL(fob)} covers trip fuel ${fL(tripFuel)}`;
  }else if(depP<=0||arrP<=0){
    decision="ENTER PRICES";note="Enter fuel prices at both airports";
  }else{
    const netPerLb=priceDiff-breakEven;
    if(netPerLb>0||arrRampFee>0||depRampFee>0){
      let bestSavings=-Infinity,bestLbs=0;
      for(let tl=0;tl<=maxExtra;tl+=200){
        const pen=tl*penFactor*hrs;
        // Arrival ramp fee: if tankering means we buy less at destination than the waiver threshold
        const arrivalFob=Math.max(0,fob+tl-baseBurn);
        const fuelNeededAtDest=arrRampFee>0&&nextLeg?Math.max(0,Number(nextLeg.plannedBurnLbs||0)+Number(reserveFuel||3000)-arrivalFob):0;
        const arrFeeWaived=arrRampFee>0&&arrMinPurLbs>0&&fuelNeededAtDest>=arrMinPurLbs;
        const arrFeeCost=arrRampFee>0&&!arrFeeWaived?arrRampFee:0;
        const arrFeeBaseline=(()=>{
          const baseArrFob=Math.max(0,fob-baseBurn);
          const baseFuelNeeded=arrRampFee>0&&nextLeg?Math.max(0,Number(nextLeg.plannedBurnLbs||0)+Number(reserveFuel||3000)-baseArrFob):0;
          const baseWaived=arrRampFee>0&&arrMinPurLbs>0&&baseFuelNeeded>=arrMinPurLbs;
          return arrRampFee>0&&!baseWaived?arrRampFee:0;
        })();
        const arrFeeSaved=arrFeeBaseline-arrFeeCost;
        // Departure ramp fee: waived if total fuel purchased at dep >= threshold
        const fuelBoughtAtDep=Math.max(0,tripFuel-fob)+tl;
        const depRampWaived=depRampFee>0&&depMinPurLbs>0&&fuelBoughtAtDep>=depMinPurLbs;
        const depRampCost=depRampFee>0&&!depRampWaived?depRampFee:0;
        const depRampBaseline=(()=>{
          const baseFuel=Math.max(0,tripFuel-fob);
          const baseWaived=depRampFee>0&&depMinPurLbs>0&&baseFuel>=depMinPurLbs;
          return depRampFee>0&&!baseWaived?depRampFee:0;
        })();
        const depRampSaved=depRampBaseline-depRampCost;
        const s=tl*priceDiff-pen*depP+arrFeeSaved+depRampSaved;
        if(s>bestSavings){bestSavings=s;bestLbs=tl;}
      }
      savings=bestSavings;tankerLbs=bestLbs;
      if(savings>0){decision="TANKER";note="Price diff offsets burn penalty";}
      else{decision="NO TANKER";tankerLbs=0;savings=0;note=priceDiff<=0?`Fuel cheaper at ${leg.to||"destination"}`:"Price diff too small";}
    }else{
      decision="NO TANKER";note=priceDiff<=0?`Fuel cheaper at ${leg.to||"destination"}`:"Burn penalty exceeds price benefit";
    }
  }

  const takeoffWt=zfw+tripFuel+tankerLbs;
  if(tankerLbs>0&&takeoffWt>Number(ac.mtow||90500)){
    const ex=Math.round(takeoffWt-Number(ac.mtow||90500));
    tankerLbs=Math.max(0,tankerLbs-ex);
    weightWarning=`MTOW limit — tanker reduced by ${fL(ex)}`;
  }
  // Calculate dep ramp fee status for display
  const fuelBoughtAtDep=Math.max(0,tripFuel-fob)+tankerLbs;
  const depRampWaived=depRampFee>0&&depMinPurLbs>0&&fuelBoughtAtDep>=depMinPurLbs;
  const depRampOwed=depRampFee>0&&!depRampWaived;
  return{decision,tankerLbs,savings,weightWarning,note,hrs,baseBurn,tripFuel,arrRampFee,depRampFee,depRampWaived,depRampOwed,maxExtra,zfw,fob,fobCoversTrip,arrivalFob:Math.max(0,fob+tankerLbs-baseBurn),depP,arrP,priceDiff,breakEven,penFactor};
}

// ── Image import ──────────────────────────────────────────────────────────
async function imageToTinyJpeg(file,maxPx){
  const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error("Cannot read file"));r.readAsDataURL(file);});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Cannot decode image"));i.src=dataUrl;});
  const ratio=Math.min(1,maxPx/Math.max(img.width||1,img.height||1));
  const w=Math.max(1,Math.round((img.width||maxPx)*ratio));
  const h=Math.max(1,Math.round((img.height||maxPx)*ratio));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas not supported");
  ctx.filter="grayscale(100%) contrast(1.3)";ctx.drawImage(img,0,0,w,h);
  const jpeg=canvas.toDataURL("image/jpeg",0.65);
  if(!jpeg||jpeg.length<200)throw new Error("Conversion failed");
  return{b64:jpeg.split(",")[1],size:Math.round(jpeg.length*0.75/1024)};
}

// Clean compressor for dark-UI screenshots (no grayscale/contrast filter)
async function imageToCleanJpeg(file,maxPx){
  const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error("Cannot read file"));r.readAsDataURL(file);});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Cannot decode image"));i.src=dataUrl;});
  const ratio=Math.min(1,maxPx/Math.max(img.width||1,img.height||1));
  const w=Math.max(1,Math.round((img.width||maxPx)*ratio));
  const h=Math.max(1,Math.round((img.height||maxPx)*ratio));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas not supported");
  ctx.drawImage(img,0,0,w,h);
  const jpeg=canvas.toDataURL("image/jpeg",0.8);
  if(!jpeg||jpeg.length<200)throw new Error("Conversion failed");
  return{b64:jpeg.split(",")[1],size:Math.round(jpeg.length*0.75/1024)};
}

async function parseImageViaAPI(b64){
  const prompt="Extract flight legs from this trip sheet image. Return ONLY a raw JSON array:\n"+
    '[{"from":"KABE","to":"MYNN","distNm":1004,"plannedBurnLbs":7815,"cruiseAltFt":43000}]\n'+
    "Rules: FL430=43000ft. BURN=plannedBurnLbs. DIST=distNm. Use null if unclear.";
  const body={model:"claude-sonnet-4-20250514",max_tokens:600,
    messages:[{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
      {type:"text",text:prompt}]}]};
  let res,data;
  try{
    res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    data=JSON.parse(await res.text());
  }catch(e){throw new Error("API unreachable");}
  if(data.error)throw new Error(data.error.message||"API error");
  const raw=data.content?.find(b=>b.type==="text")?.text||"";
  try{return JSON.parse(raw.trim());}catch{}
  const clean=raw.replace(/```[a-z]*/g,"").replace(/```/g,"").trim();
  try{return JSON.parse(clean);}catch{}
  const m=raw.match(/\[[\s\S]*\]/);if(m){try{return JSON.parse(m[0]);}catch{}}
  return null;
}

async function parseDutyImageViaAPI(b64){
  const prompt=`Extract ALL flight legs from this trip schedule screenshot. Return ONLY a raw JSON array with this exact structure:
[{"legNum":1,"date":{"day":23,"month":"APR","year2":25},"origin":"MMTO","dest":"MYNN","depTime":"21:00","arrTime":"01:54","flightTime":"2:54","hasRest":true,"restTime":"15:01"},{"legNum":2,...}]
Rules:
- date: day (number), month (3-letter uppercase), year2 (2-digit year number)
- depTime/arrTime: "HH:MM" in local time as shown
- flightTime: from the (H:MM) parenthetical value
- hasRest: true ONLY if "Rest: X:XX" appears for this leg. false otherwise.
- restTime: the "H:MM" value after "Rest:" if present, null otherwise
- If a leg has no date shown, copy from the previous leg (incrementing day if needed based on context)
- Include ALL legs visible in the image
- Do NOT skip any legs`;
  const body={model:"claude-sonnet-4-20250514",max_tokens:1200,
    messages:[{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
      {type:"text",text:prompt}]}]};
  let res,data;
  try{
    res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  }catch(e){throw new Error("Network error: "+e.message);}
  if(!res.ok){
    let errText="";try{errText=await res.text();}catch{}
    throw new Error("HTTP "+res.status+": "+(errText||"").slice(0,80));
  }
  try{data=JSON.parse(await res.text());}catch(e){throw new Error("Bad response format");}
  if(data.error)throw new Error(data.error.message||"API error");
  const raw=data.content?.find(b=>b.type==="text")?.text||"";
  try{return JSON.parse(raw.trim());}catch{}
  const clean=raw.replace(/```[a-z]*/g,"").replace(/```/g,"").trim();
  try{return JSON.parse(clean);}catch{}
  const m=raw.match(/\[[\s\S]*\]/);if(m){try{return JSON.parse(m[0]);}catch{}}
  return null;
}

function visionResultToLegs(arr){
  if(!arr||!Array.isArray(arr)||arr.length===0)return null;
  const legs=arr.map(r=>{
    const depParts=(r.depTime||"0:00").split(":");
    const arrParts=(r.arrTime||"0:00").split(":");
    const ftParts=(r.flightTime||"0:00").split(":");
    const depH=Number(depParts[0]),depM=Number(depParts[1]||0);
    const arrH=Number(arrParts[0]),arrM=Number(arrParts[1]||0);
    let flightMins=Number(ftParts[0])*60+Number(ftParts[1]||0);
    if(!flightMins){let ft=(arrH*60+arrM)-(depH*60+depM);if(ft<0)ft+=1440;flightMins=ft;}
    let date=null;
    if(r.date&&r.date.month&&r.date.day){
      date={day:Number(r.date.day),month:String(r.date.month).toUpperCase(),year2:Number(r.date.year2||25)};
    }
    return{origin:r.origin||"????",dest:r.dest||"????",depH,depM,arrH,arrM,flightMins,
      hasRest:!!r.hasRest,restMins:r.restTime?Number(r.restTime.split(":")[0])*60+Number((r.restTime.split(":")[1])||0):null,
      date};
  });
  return{legs,needDate:!legs[0].date};
}

// ── OCR-aware trip parser (handles Tesseract output from ARINCDirect) ────
function parseOcrTripText(text){
  const lines=text.split(/\n/).map(l=>l.trim()).filter(Boolean);
  // Match route lines: ICAO followed by arrow-like chars and another ICAO
  // OCR produces: -» =» => -> → and variations
  const routeRe=/^([A-Z]{4})\s*[-=]+[»>→]+\s*([A-Z]{4})/;
  const legs=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(routeRe);
    if(!m)continue;
    const leg={from:m[1],to:m[2],ete:null,plannedBurnLbs:null,cruiseAltFt:null,distNm:null};
    // Look ahead for ETE BURN CRUISE FL DIST header line
    for(let j=i+1;j<Math.min(i+8,lines.length);j++){
      if(routeRe.test(lines[j]))break;
      // Check for header line
      if(/ETE\s+BURN/.test(lines[j])){
        // Next line should be the data values
        const dataLine=lines[j+1]||"";
        const parts=dataLine.split(/\s+/).filter(Boolean);
        if(parts.length>=5){
          // parts: [ETE, BURN, CRUISE, FL, DIST]
          const eteRaw=parts[0];
          const burn=Number(parts[1]);
          const fl=parts[3];
          const dist=Number(parts[4]);
          // Parse ETE: could be "7+42", "742", "0+55", "2427"
          let eteMin=0;
          if(eteRaw.includes("+")){
            const ep=eteRaw.split("+");
            eteMin=Number(ep[0])*60+Number(ep[1]);
          }else{
            // No +, try to split: last 2 digits = minutes, rest = hours
            const eteNum=eteRaw.replace(/[^0-9]/g,"");
            if(eteNum.length>=3){
              const mins=Number(eteNum.slice(-2));
              const hrs=Number(eteNum.slice(0,-2));
              if(hrs<24&&mins<60)eteMin=hrs*60+mins;
            }else if(eteNum.length===2){
              eteMin=Number(eteNum); // assume minutes
            }else{
              eteMin=Number(eteNum)*60; // assume hours
            }
          }
          leg.ete=eteMin>0?Math.floor(eteMin/60)+"+"+String(eteMin%60).padStart(2,"0"):null;
          if(burn>0)leg.plannedBurnLbs=burn;
          if(dist>0)leg.distNm=dist;
          // Parse FL: could be "450", "430", "50" (OCR dropped a digit)
          let flNum=Number(fl);
          if(flNum>0){
            if(flNum<100)flNum=flNum*10; // "50" → 500 → probably 450, but best guess is *10
            // FL is in hundreds of feet, convert to feet
            leg.cruiseAltFt=flNum*100;
          }
        }else if(parts.length>=2){
          // Partial parse — try to get at least BURN
          for(const p of parts){const n=Number(p);if(n>1000&&n<50000&&!leg.plannedBurnLbs)leg.plannedBurnLbs=n;}
          for(const p of parts){const n=Number(p);if(n>100&&n<5000&&!leg.distNm)leg.distNm=n;}
        }
        break;
      }
    }
    legs.push(leg);
  }
  return legs.length>0?legs:[];
}

function parseTripText(text){
  // Try OCR format first, fall back to schedule, then original
  const ocrResult=parseOcrTripText(text);
  if(ocrResult&&ocrResult.length>0)return ocrResult;
  const lines=text.split(/\n/).map(l=>l.trim()).filter(Boolean);
  const routeRe=/^([A-Z]{4})\s*[\u2192\->]+\s*([A-Z]{4})$/;
  const legs=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(routeRe);
    if(m){
      const leg={from:m[1],to:m[2],ete:null,plannedBurnLbs:null,cruiseAltFt:null,distNm:null};
      for(let j=i+1;j<Math.min(i+9,lines.length);j++){
        if(lines[j].match(routeRe))break;
        if(lines[j]==="ETE"&&/^\d+\+\d+$/.test(lines[j+1]||"")){leg.ete=lines[j+1];j++;}
        if(lines[j]==="BURN"&&/^\d+$/.test(lines[j+1]||"")){leg.plannedBurnLbs=Number(lines[j+1]);j++;}
      }
      legs.push(leg);
    }
  }
  if(legs.length===0)return[];
  const allBurns=[];
  for(let i=0;i<lines.length;i++){if(lines[i]==="BURN"&&/^\d+$/.test(lines[i+1]||""))allBurns.push(Number(lines[i+1]));}
  const usedBurns=new Set(legs.map(l=>l.plannedBurnLbs).filter(Boolean));
  const unusedBurns=allBurns.filter(b=>!usedBurns.has(b));
  let ubIdx=0;
  legs.forEach(leg=>{if(!leg.plannedBurnLbs&&ubIdx<unusedBurns.length)leg.plannedBurnLbs=unusedBurns[ubIdx++];});
  const flDist=[];
  for(let i=0;i<lines.length;i++){
    if(lines[i]==="FL"){
      const n1=lines[i+1]||"",n2=lines[i+2]||"",n3=lines[i+3]||"";
      if(n1==="DIST"&&/^\d+$/.test(n2)&&/^\d+$/.test(n3)){flDist.push({fl:Number(n2)*100,dist:Number(n3)});i+=3;}
      else if(/^\d+$/.test(n1)&&n2==="DIST"&&/^\d+$/.test(n3)){flDist.push({fl:Number(n1)*100,dist:Number(n3)});i+=3;}
    }
  }
  flDist.forEach((b,idx)=>{if(legs[idx]){legs[idx].cruiseAltFt=b.fl;legs[idx].distNm=b.dist;}});
  return legs;
}

// ── PDF helpers (pdf.js, CDN-loaded on demand) ─────────────────────────────
let _pdfLoading=false;
function loadPdfJs(){
  return new Promise((resolve,reject)=>{
    if(window.pdfjsLib){resolve(true);return;}
    const ready=()=>{
      if(window.pdfjsLib){
        try{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}catch{}
        resolve(true);
      }else reject(new Error("pdf.js failed to load"));
    };
    const existing=[...document.scripts].find(s=>s.src&&s.src.includes("pdf.min.js"));
    if(existing){if(window.pdfjsLib){ready();return;}existing.addEventListener("load",ready);existing.addEventListener("error",()=>reject(new Error("pdf.js failed to load")));return;}
    if(_pdfLoading){const iv=setInterval(()=>{if(window.pdfjsLib){clearInterval(iv);ready();}},150);setTimeout(()=>clearInterval(iv),15000);return;}
    _pdfLoading=true;
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{_pdfLoading=false;ready();};
    s.onerror=()=>{_pdfLoading=false;reject(new Error("pdf.js failed to load"));};
    document.head.appendChild(s);
  });
}
// Extract text from every page, reconstructing lines by Y position, then
// concatenate all pages (multi-page trip sheets) into one string.
async function extractPdfText(file){
  await loadPdfJs();
  const buf=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  let allText="";
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const items=content.items.filter(it=>it.str.trim());
    if(items.length===0)continue;
    items.sort((a,b)=>{const dy=b.transform[5]-a.transform[5];if(Math.abs(dy)>3)return dy;return a.transform[4]-b.transform[4];});
    let lastY=null;
    for(const item of items){
      const y=Math.round(item.transform[5]);
      if(lastY!==null&&Math.abs(y-lastY)>3)allText+="\n";else if(lastY!==null)allText+=" ";
      allText+=item.str;lastY=y;
    }
    allText+="\n";
  }
  return allText;
}

// ── GAC Flight Release trip-sheet parser ───────────────────────────────────
// Reads dispatch PDFs (FlightBridge/GAC). Pulls per-leg route + distance + burn
// from the "LEG x of y" detail sections, and per-airport fuel pricing from the
// page-3 fuel-note blocks (separated by //// lines). Prices in the PDF are per
// GALLON and converted to per-LB (÷ LBS_PER_GAL). Returns null if unrecognized.
function parseTripSheetPDF(text){
  if(!text)return null;
  const tripMatch=text.match(/Trip\s*#:?\s*(\d+)/i);
  const tripNum=tripMatch?tripMatch[1]:null;

  // Authoritative ordered airport list from the "Summary:" line, when present.
  const sumMatch=text.match(/Summary:\s*([A-Z]{4}(?:\s*,\s*[A-Z]{4})*)/);
  const summaryList=sumMatch?sumMatch[1].split(/[,\s]+/).filter(Boolean):[];
  const summarySet=new Set(summaryList);

  // Fuel notes (page 3): blocks delimited by //// lines.
  const fuelNotes={};
  text.split(/\/{3,}/).forEach(block=>{
    const ic=block.match(/ICAO:\s*([A-Z]{4})/i);
    if(!ic)return;
    const icao=ic[1].toUpperCase();
    const pr=block.match(/Quoted Price:\s*\$?\s*(\d+(?:\.\d+)?)/i);
    const rf=block.match(/Ramp Fee:\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
    const wv=block.match(/Waived:\s*([\d,]+)\s*Gallon/i);
    fuelNotes[icao]={
      pricePerGal:pr?Number(pr[1]):null,
      rampFee:rf?Number(rf[1].replace(/,/g,"")):null,
      waivedGal:wv?Number(wv[1].replace(/,/g,"")):null,
    };
  });

  // Leg detail blocks (page 2): split on "LEG x of y" markers.
  function icaoPair(block){
    const re=/\b([A-Z]{4})\b/g;let m;const found=[];
    while((m=re.exec(block))){
      const code=m[1];
      if(summarySet.size===0||summarySet.has(code))found.push(code);
      if(found.length>=2)break;
    }
    return found.length>=2?[found[0],found[1]]:[found[0]||null,null];
  }
  const legParts=text.split(/LEG\s+\d+\s+of\s+\d+/i).slice(1);
  let legs=legParts.map(block=>{
    const[from,to]=icaoPair(block);
    const dm=block.match(/Distance:\s*([\d,]+)\s*nm/i);
    const bm=block.match(/Fuel\s*Burn:\s*([\d,]+)\s*lbs/i);
    return{from,to,
      distNm:dm?Number(dm[1].replace(/,/g,"")):null,
      plannedBurnLbs:bm?Number(bm[1].replace(/,/g,"")):null};
  });
  // Fallback: derive routing from the Summary order if leg blocks gave no ICAOs.
  if((legs.length===0||legs.every(l=>!l.from))&&summaryList.length>=2){
    legs=[];
    for(let i=0;i<summaryList.length-1;i++)legs.push({from:summaryList[i],to:summaryList[i+1],distNm:null,plannedBurnLbs:null});
  }
  if(legs.length===0)return null;

  // Attach fuel pricing per leg. Departure airport's note drives dep price,
  // ramp fee and waiver; arrival airport's note drives arr price.
  const toPerLb=g=>g==null?"":String((g/LBS_PER_GAL).toFixed(4));
  legs.forEach(l=>{
    const dn=l.from?fuelNotes[l.from]:null;
    const an=l.to?fuelNotes[l.to]:null;
    l.depPrice=dn&&dn.pricePerGal!=null?toPerLb(dn.pricePerGal):"";
    l.arrPrice=an&&an.pricePerGal!=null?toPerLb(an.pricePerGal):"";
    l.depRampFee=dn&&dn.rampFee!=null?String(dn.rampFee):"";
    l.depMinPurchase=dn&&dn.waivedGal!=null?String(dn.waivedGal):"";
  });
  return{tripNum,legs,fuelNotes};
}

// ── Brief builder ─────────────────────────────────────────────────────────
function buildBrief(legs,results,totalSavings,currency,aircraft,globalAlt,reserveFuel){
  const sym=currency.symbol,pos=totalSavings>0;
  const route=legs.map((l,i)=>i===0?l.from+"→"+l.to:l.to).join("→");
  return{legs,results,totalSavings,route,sym,pos,aircraft,currency,reserveFuel,ts:new Date().toLocaleString()};
}

// ── NumPad ────────────────────────────────────────────────────────────────
function NumPad({value,onChange,onClose,onNext,label,step,legNum,legContext,legColor}){
  const[val,setVal]=useState(String(value||""));
  const isDecimal=String(step||"any").includes(".");
  const lc=legColor||C.accent;
  function press(k){
    if(k==="⌫"){setVal(v=>v.slice(0,-1));return;}
    if(k==="."){if(val.includes("."))return;setVal(v=>v+".");return;}
    if(k==="C"){setVal("");return;}
    setVal(v=>v==="0"?k:v+k);
  }
  function confirm(){onChange(val);onClose();if(onNext)setTimeout(onNext,100);}
  const rows=[["7","8","9"],["4","5","6"],["1","2","3"],isDecimal?[".","0","⌫"]:["C","0","⌫"]];
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100vw",maxWidth:"100vw",zIndex:1000,background:C.panel,borderTop:"2px solid "+lc,borderRadius:"16px 16px 0 0",background:"#1b2a4a",padding:"12px 20px 40px",boxSizing:"border-box",boxShadow:"0 -8px 40px #000c"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <div>
          {legNum&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{background:lc,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:800,color:"#fff",letterSpacing:.5}}>LEG {legNum}</div>
            {legContext&&<div style={{fontSize:15,fontWeight:800,color:"#dce6ee",letterSpacing:1.5}}>{legContext}</div>}
          </div>}
          <div style={{fontSize:12,color:lc,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6a8fa8",fontSize:22,cursor:"pointer",padding:"4px 10px",lineHeight:1,flexShrink:0}}>✕</button>
      </div>
      <div style={{background:"#0f1829",borderRadius:10,padding:"14px 18px",marginBottom:12,textAlign:"right",border:"1.5px solid "+C.accent}}>
        <span style={{fontSize:34,fontWeight:800,color:"#dce6ee",letterSpacing:1}}>{val||"0"}</span>
      </div>
      {rows.map((row,ri)=>(
        <div key={ri} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          {row.map(k=>(
            <button key={k} onClick={()=>press(k)}
              style={{padding:"20px 0",fontSize:k==="⌫"?22:26,fontWeight:"700",
                background:k==="⌫"?"#1e3050":k==="C"?"#3a1010":"#0f1829",
                color:k==="C"?"#c0504a":"#dce6ee",border:"1.5px solid #1a2a3a",
                borderRadius:14,cursor:"pointer",lineHeight:1,
                WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <button onClick={confirm}
        style={{width:"100%",marginTop:4,background:"linear-gradient(135deg,"+lc+","+lc+"bb)",
          border:"none",borderRadius:14,padding:"18px",color:"#fff",fontSize:19,fontWeight:800,
          cursor:"pointer",letterSpacing:.3,WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
        Done
      </button>
    </div>
  );
}

function NumPadOverlay({children,onClose}){
  useEffect(()=>{
    const y=window.scrollY;
    document.body.style.position="fixed";document.body.style.top=-y+"px";
    document.body.style.left="0";document.body.style.right="0";document.body.style.overflow="hidden";
    return()=>{document.body.style.cssText="";window.scrollTo(0,y);};
  },[]);
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:999,background:"#0007"}}
      onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      {children}
    </div>
  );
}

// ── Field component ───────────────────────────────────────────────────────
// window.__e6b is a registry of open functions keyed by fieldId
function Field({label,value,onChange,step,fieldId,onNext,color,legNum,legContext}){
  const[showPad,setShowPad]=useState(false);
  const hasKb=useHasKeyboard();
  const lc=color||C.accent;
  // Local buffer for keyboard typing — only synced to the parent on blur/Enter.
  // Without this, every keystroke updates parent state, the leg re-renders, and
  // the input loses focus after a single digit.
  const[local,setLocal]=useState(value);
  const focusedRef=useRef(false);
  useEffect(()=>{if(!focusedRef.current)setLocal(value);},[value]);
  const commit=()=>{focusedRef.current=false;if(local!==value)onChange(local);};
  useEffect(()=>{
    if(!fieldId)return;
    window.__e6b=window.__e6b||{};
    window.__e6b[fieldId]=()=>setShowPad(true);
    return()=>{if(window.__e6b)delete window.__e6b[fieldId];};
  },[fieldId]);
  return(
    <div style={{marginBottom:0}}>
      <div style={{fontSize:11,fontWeight:600,color:lc,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>{label}</div>
      <div style={{position:"relative"}}>
        {hasKb
          ?<input type="text" inputMode="decimal" value={local}
             onChange={e=>setLocal(e.target.value)}
             onFocus={e=>{focusedRef.current=true;e.target.select();}}
             onBlur={commit}
             onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();e.target.blur();if(onNext)onNext();}}}
             style={{width:"100%",background:lc+"0d",border:"1.5px solid "+lc+"55",borderRadius:8,
               padding:"10px 40px 10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
          :<input readOnly value={value} onClick={()=>setShowPad(true)}
             style={{width:"100%",background:lc+"0d",border:"1.5px solid "+lc+"55",borderRadius:8,
               padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box",cursor:"pointer"}}/>}
        {hasKb&&<button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setShowPad(true)}
          title="Open numpad"
          style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
            background:lc+"1a",border:"1px solid "+lc+"44",borderRadius:6,padding:"4px 6px",
            fontSize:14,lineHeight:1,cursor:"pointer",color:lc}}>🔢</button>}
        {showPad&&<NumPadOverlay onClose={()=>setShowPad(false)}>
          <NumPad value={value} label={label} step={step||"any"}
            onChange={v=>{setLocal(v);onChange(v);setShowPad(false);}}
            onClose={()=>setShowPad(false)}
            onNext={onNext}
            legNum={legNum} legContext={legContext} legColor={lc}/>
        </NumPadOverlay>}
      </div>
    </div>
  );
}

// Simple text input styled to match
const LS={fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:.8,marginBottom:5,display:"block"};
function TextInp({label,value,onChange,maxLength,style}){
  return(<div style={{marginBottom:0}}>
    <label style={{...LS,color:C.sub}}>{label}</label>
    <input type="text" value={value} onChange={e=>onChange(e.target.value)} maxLength={maxLength}
      style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,
        padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box",...style}}/>
  </div>);
}

// ── Decision Badge ────────────────────────────────────────────────────────
function DecisionBadge({r,sym,from,to}){
  if(!r||r.decision==="ENTER PRICES")return null;
  const isTanker=r.decision==="TANKER"||r.decision==="MUST TANKER";
  const isNoPurchase=r.decision==="NO PURCHASE";
  const isNoFuel=isNoPurchase||(!isTanker&&r.fobCoversTrip);
  const isTripFuelOnly=!isTanker&&!isNoFuel&&r.decision==="NO TANKER";
  const bg=isTanker?C.green:isNoFuel?C.red:isTripFuelOnly?C.gold:C.red;
  const icon=isTanker?"✅":isNoFuel?"❌":isTripFuelOnly?"⛽":"❌";
  const[showExp,setShowExp]=React.useState(false);

  let action="";
  if(isTanker)action="LOAD "+fL(r.tankerLbs)+" ("+fG(r.tankerLbs)+") at "+(from||"departure");
  else if(isNoPurchase)action="NO FUEL at "+(from||"departure")+" — current FOB covers this leg";
  else if(r.fobCoversTrip)action="NO FUEL at "+(from||"departure")+" — depart with current FOB";
  else if(r.arrRampFee>0)action="TRIP FUEL ONLY at "+(from||"departure")+" — cheaper to refuel at "+(to||"destination");
  else action="TRIP FUEL ONLY at "+(from||"departure")+" — cheaper to refuel at "+(to||"destination");

  // Build plain-English explanation
  function buildExplanation(){
    const depP=Number(r.depP||0),arrP=Number(r.arrP||0);
    const diff=Number(r.priceDiff||0);
    const be=Number(r.breakEven||0);
    const hrs=Number(r.hrs||0);
    const pen=Number(r.penFactor||0.04);
    const lines=[];

    if(r.decision==="MUST TANKER"){
      lines.push("No fuel is available at "+(to||"destination")+".");
      lines.push("You must carry enough fuel to complete this leg.");
      if(r.tankerLbs>0)lines.push("Load "+fL(r.tankerLbs)+" ("+fG(r.tankerLbs)+") at "+(from||"departure")+" before departure.");
      return lines;
    }

    if(r.decision==="NO PURCHASE"){
      lines.push("Your current fuel on board ("+fL(r.fob)+") is sufficient to complete this leg including reserves.");
      lines.push("No fuel purchase is needed at "+(from||"departure")+".");
      lines.push("Arrival fuel remaining: "+fL(r.arrivalFob)+".");
      return lines;
    }

    if(depP>0&&arrP>0){
      if(diff<0){
        lines.push("Fuel at "+(to||"destination")+" ("+sym+arrP.toFixed(3)+"/lb) is cheaper than "+(from||"departure")+" ("+sym+depP.toFixed(3)+"/lb) by "+sym+Math.abs(diff).toFixed(3)+"/lb.");
      } else if(diff>0){
        lines.push("Fuel at "+(from||"departure")+" ("+sym+depP.toFixed(3)+"/lb) is cheaper than "+(to||"destination")+" ("+sym+arrP.toFixed(3)+"/lb) by "+sym+diff.toFixed(3)+"/lb.");
      } else {
        lines.push("Fuel prices at both airports are identical ("+sym+depP.toFixed(3)+"/lb).");
      }
    }

    if(hrs>0&&pen>0&&depP>0){
      lines.push("Carrying extra fuel burns approximately "+sym+(pen*depP).toFixed(3)+"/lb per hour in penalty. Over "+hrs.toFixed(1)+" hrs the break-even price difference is "+sym+be.toFixed(3)+"/lb.");
    }

    if(r.decision==="TANKER"){
      if(diff>be){
        lines.push("The price advantage ("+sym+diff.toFixed(3)+"/lb) exceeds the carry penalty ("+sym+be.toFixed(3)+"/lb), so tankering saves money.");
      }
      if(r.depRampFee>0){
        lines.push(r.depRampWaived
          ?"The "+sym+r.depRampFee+" departure ramp fee at "+(from||"departure")+" is waived by the fuel purchase."
          :"A departure ramp fee of "+sym+r.depRampFee+" applies at "+(from||"departure")+".");
      }
      lines.push("Net savings by loading "+fL(r.tankerLbs)+" here: "+sym+Math.abs(r.savings).toFixed(2)+".");
    }

    if(r.decision==="NO TANKER"){
      if(r.fobCoversTrip){
        lines.push("Your current FOB ("+fL(r.fob)+") already covers trip fuel ("+fL(r.tripFuel)+"). No additional fuel purchase needed at "+(from||"departure")+".");
      } else if(diff<=0){
        lines.push("Fuel at "+(to||"destination")+" ("+sym+arrP.toFixed(3)+"/lb) is cheaper than "+(from||"departure")+" ("+sym+depP.toFixed(3)+"/lb). Load trip fuel only — no extra.");
      } else if(diff>0&&diff<=be){
        lines.push("Although fuel is cheaper here by "+sym+diff.toFixed(3)+"/lb, the burn penalty of "+sym+be.toFixed(3)+"/lb over "+hrs.toFixed(1)+" hrs wipes out the savings. Carrying extra fuel would cost more than it saves.");
      }
      if(r.depRampFee>0&&r.depRampOwed){
        lines.push("A departure ramp fee of "+sym+r.depRampFee+" applies at "+(from||"departure")+".");
      }
      if(r.fobCoversTrip){
        lines.push("Depart "+(from||"departure")+" with current fuel. No purchase needed.");
      } else {
        lines.push("Load trip fuel only at "+(from||"departure")+". Refuel at "+(to||"destination")+" on arrival.");
      }
    }

    return lines;
  }

  const expLines=buildExplanation();

  return(
    <div style={{background:C.bg,borderRadius:12,padding:14,marginTop:10,border:"2px solid "+bg+"44"}}>
      {/* Main verdict */}
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:isTanker&&r.tankerLbs>0?12:4}}>
        <div style={{fontSize:26,lineHeight:1,flexShrink:0}}>{icon}</div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:bg,lineHeight:1.3}}>{action}</div>
          {r.note&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>{r.note}</div>}
        </div>
      </div>

      {/* Tanker breakdown */}
      {isTanker&&r.tankerLbs>0&&(()=>{
        const takeoffFuel=r.tripFuel+r.tankerLbs;
        const fuelToLoad=Math.max(0,takeoffFuel-r.fob);
        return<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:6}}>
          {[{l:"Takeoff Fuel",v:fL(takeoffFuel),h:false},{l:"Current FOB",v:"−"+fL(r.fob),h:false},{l:"Fuel to Load",v:fL(fuelToLoad),h:true}].map(({l,v,h})=>(
            <div key={l} style={{background:h?C.green+"12":C.bg,borderRadius:7,padding:"8px 6px",textAlign:"center",border:h?"1.5px solid "+C.green+"44":"none"}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:2,textTransform:"uppercase",letterSpacing:.4}}>{l}</div>
              <div style={{fontSize:12,fontWeight:h?800:700,color:h?C.green:C.text}}>{v}</div>
            </div>))}
        </div>
        <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:r.savings>0?10:0}}>
          {fG(fuelToLoad)} · {fLt(fuelToLoad)} · includes {fL(r.tankerLbs)} ({fG(r.tankerLbs)}) extra tankering
        </div>
        {r.savings>0&&<div style={{background:C.green+"15",border:"1px solid "+C.green+"33",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:12,color:C.sub}}>Net savings this leg</span>
          <span style={{fontSize:15,fontWeight:800,color:C.green}}>+{fM(r.savings,sym)}</span>
        </div>}
      </>;})()}

      {/* Departure ramp fee status */}
      {r.depRampFee>0&&<div style={{background:(r.depRampWaived?C.green:C.gold)+"15",border:"1px solid "+(r.depRampWaived?C.green:C.gold)+"33",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4,marginBottom:10}}>
        <span style={{fontSize:12,color:C.sub}}>Dep ramp fee at {from}{r.depRampWaived?" (waived)":""}</span>
        <span style={{fontSize:15,fontWeight:800,color:r.depRampWaived?C.green:C.gold}}>{r.depRampWaived?"WAIVED":sym+Number(r.depRampFee||0).toFixed(0)}</span>
      </div>}

      {/* Explanation toggle */}
      <button onClick={()=>setShowExp(!showExp)}
        style={{width:"100%",background:"transparent",border:"1px solid "+bg+"33",borderRadius:8,
          padding:"8px 12px",color:bg,fontSize:12,fontWeight:600,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:4}}>
        <span>{showExp?"▲ Hide":"▼ Why?"}</span>
      </button>

      {/* Explanation */}
      {showExp&&<div style={{marginTop:10,background:bg+"0d",border:"1px solid "+bg+"22",borderRadius:8,padding:"12px 14px"}}>
        {expLines.map((line,i)=>(
          <div key={i} style={{fontSize:13,color:C.text,lineHeight:1.7,paddingBottom:i<expLines.length-1?8:0,borderBottom:i<expLines.length-1?"1px solid "+bg+"22":"none",marginBottom:i<expLines.length-1?8:0}}>
            {line}
          </div>
        ))}
      </div>}

      {r.weightWarning&&<div style={{fontSize:11,color:C.amber,marginTop:8,textAlign:"center"}}>&#9888; {r.weightWarning}</div>}
      {r.arrivalFob>0&&<div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"center"}}>
        Arrival FOB: <span style={{color:C.sub,fontWeight:600}}>{fL(r.arrivalFob)}</span> carried to next leg
      </div>}
    </div>
  );
}


// ── Leg Card ──────────────────────────────────────────────────────────────
function LegCard({leg,legNum,total,currency,result:r,onChange,onRemove,legColor,onNextLeg,onCalculate}){
  const sym=currency.symbol;
  const lc=legColor||C.accent;
  const lcBorder=lc+"55";
  const isTanker=r?.decision==="TANKER"||r?.decision==="MUST TANKER";
  const isNoFuel=r?.decision==="NO PURCHASE"||(r&&!isTanker&&r.fobCoversTrip);
  const resultBorder=r?isTanker?C.green+"88":isNoFuel?C.red+"66":r.decision==="NO TANKER"?C.gold+"66":lc+"88":lc+"44";

  // Auto-tab: open next empty field. Tab order: dist→burn→alt→depPrice→arrPrice→rampFee→payload
  // Skip pre-filled fields
  function nextField(fields){
    for(const f of fields){
      if(!f.val&&window.__e6b?.[f.id]){
        console.log("[E6B TAB] Opening field:",f.id);
        setTimeout(()=>window.__e6b[f.id](),80);return;
      } else if(!f.val){
        console.log("[E6B TAB] Field",f.id,"is empty but NOT registered in __e6b");
      } else {
        console.log("[E6B TAB] Skipping",f.id,"— already filled:",f.val);
      }
    }
    console.log("[E6B TAB] All fields done — triggering",onNextLeg?"nextLeg":"calculate");
    if(onNextLeg)onNextLeg();
    else if(onCalculate)onCalculate();
  }

  // Use a ref so after() always reads the latest leg values at tab time
  const legRef=useRef(leg);
  legRef.current=leg;

  function getFields(){
    const l=legRef.current;
    return[
      {id:"d"+legNum,val:l.distNm},
      {id:"b"+legNum,val:l.plannedBurnLbs},
      {id:"a"+legNum,val:l.cruiseAltFt},
      {id:"dp"+legNum,val:l.depPrice},
      {id:"ap"+legNum,val:l.arrPrice},
      {id:"drf"+legNum,val:l.depRampFee},
      {id:"dwv"+legNum,val:l.depMinPurchase},
      {id:"py"+legNum,val:l.payload},
    ];
  }

  function after(idx){
    return()=>{
      const remaining=getFields().slice(idx+1);
      nextField(remaining);
    };
  }

  return(
    <div style={{borderRadius:14,marginBottom:16,overflow:"hidden",border:"2px solid "+resultBorder,boxShadow:"0 4px 20px "+lc+"22"}}>
      {/* Colored header */}
      <div style={{background:"linear-gradient(135deg,"+lc+"33,"+lc+"11)",borderBottom:"1px solid "+lcBorder,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:lc,borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:800,color:"#fff",letterSpacing:.5}}>LEG {legNum}</div>
          <input value={leg.from} onChange={e=>onChange({...leg,from:e.target.value.toUpperCase().slice(0,4)})} maxLength={4}
            style={{background:"transparent",border:"none",borderBottom:"2px solid "+lc,color:C.text,fontSize:16,fontWeight:800,width:58,outline:"none",textTransform:"uppercase",letterSpacing:2,padding:"2px 0",textAlign:"center"}}/>
          <span style={{color:lc,fontSize:18,fontWeight:700}}>→</span>
          <input value={leg.to} onChange={e=>onChange({...leg,to:e.target.value.toUpperCase().slice(0,4)})} maxLength={4}
            style={{background:"transparent",border:"none",borderBottom:"2px solid "+lc,color:C.text,fontSize:16,fontWeight:800,width:58,outline:"none",textTransform:"uppercase",letterSpacing:2,padding:"2px 0",textAlign:"center"}}/>
          {(leg.distNm||leg.plannedBurnLbs)&&<span style={{fontSize:11,color:lc+"cc"}}>{leg.distNm&&leg.distNm+"nm"}{leg.plannedBurnLbs&&" · "+Number(leg.plannedBurnLbs).toLocaleString()+" lbs"}</span>}
        </div>
        {total>1&&<button onClick={onRemove} style={{background:C.red+"22",border:"1px solid "+C.red+"44",color:C.red,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}>✕</button>}
      </div>

      <div style={{background:lc+"08",padding:16}}>
        {/* Row 1: flight data */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16,alignItems:"start"}}>
          <Field label="Distance (nm)" value={leg.distNm} onChange={v=>onChange({...leg,distNm:v})} step="10" color={lc} fieldId={"d"+legNum} onNext={after(0)} legNum={legNum} legContext={(leg.from||"—")+" → "+(leg.to||"—")}/>
          <Field label="Burn (lbs)" value={leg.plannedBurnLbs} onChange={v=>onChange({...leg,plannedBurnLbs:v})} step="100" color={lc} fieldId={"b"+legNum} onNext={after(1)} legNum={legNum} legContext={(leg.from||"—")+" → "+(leg.to||"—")}/>
          <Field label="Cruise Alt (ft)" value={leg.cruiseAltFt} onChange={v=>onChange({...leg,cruiseAltFt:v})} step="1000" color={lc} fieldId={"a"+legNum} onNext={after(2)} legNum={legNum} legContext={(leg.from||"—")+" → "+(leg.to||"—")}/>
        </div>

        <div style={{height:1,background:lcBorder,marginBottom:14}}/>

        {/* Row 2: fuel prices */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:lc,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>⛽ {leg.from||"DEP"} Fuel</div>
            <Field label={"DEP Fuel Price ("+sym+"/lb)"} value={leg.depPrice} onChange={v=>onChange({...leg,depPrice:v})} step="0.001" color={lc} fieldId={"dp"+legNum} onNext={after(3)} legNum={legNum} legContext={"DEP: "+(leg.from||"—")}/>
            {leg.depPrice>0&&<div style={{fontSize:10,color:lc+"99",marginTop:4}}>≈{sym}{(leg.depPrice*6.7).toFixed(2)}/gal</div>}
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:lc,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>⛽ {leg.to||"ARR"} Fuel</div>
            <Field label={"ARR Fuel Price ("+sym+"/lb)"} value={leg.arrPrice} onChange={v=>onChange({...leg,arrPrice:v})} step="0.001" color={lc} fieldId={"ap"+legNum} onNext={after(6)} legNum={legNum} legContext={"ARR: "+(leg.to||"—")}/>
            {leg.arrPrice>0&&<div style={{fontSize:10,color:lc+"99",marginTop:4}}>≈{sym}{(leg.arrPrice*6.7).toFixed(2)}/gal</div>}
          </div>
        </div>

        <div style={{height:1,background:lcBorder,marginBottom:14}}/>

        {/* Departure FBO */}
        <div style={{fontSize:11,fontWeight:700,color:lc,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>{leg.from||"Departure"} FBO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <Field label={"Ramp Fee ("+sym+")"} value={leg.depRampFee} onChange={v=>onChange({...leg,depRampFee:v})} step="50" color={lc} fieldId={"drf"+legNum} legNum={legNum} legContext={"DEP: "+(leg.from||"—")}/>
          <Field label="Waived if >= (gal)" value={leg.depMinPurchase} onChange={v=>onChange({...leg,depMinPurchase:v})} step="100" color={lc} fieldId={"dwv"+legNum} legNum={legNum} legContext={"DEP: "+(leg.from||"—")}/>
        </div>
        <div style={{height:1,background:lcBorder,marginBottom:14}}/>

        {/* Fuel available at destination */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0"}}>
          <span style={{fontSize:13,color:C.text}}>Fuel available at {leg.to||"destination"}</span>
          <div onClick={()=>onChange({...leg,arrFuelAvail:!(leg.arrFuelAvail!==false)})}
            style={{width:44,height:24,borderRadius:12,background:leg.arrFuelAvail!==false?lc:C.border,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
            <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:leg.arrFuelAvail!==false?23:3,transition:"left .2s"}}/>
          </div>
        </div>
        {leg.arrFuelAvail===false&&<div style={{background:C.red+"20",border:"1px solid "+C.red+"44",borderRadius:6,padding:"7px 10px",fontSize:12,color:C.red,marginTop:6}}>⚠ Must tanker — no fuel at destination</div>}

        <div style={{height:1,background:lcBorder,margin:"14px 0"}}/>

        {/* Row 4: payload */}
        <Field label="Departure payload (lbs)" value={leg.payload} onChange={v=>onChange({...leg,payload:v})} step="100" color={lc} fieldId={"py"+legNum} onNext={after(7)} legNum={legNum} legContext={(leg.from||"—")+" → "+(leg.to||"—")}/>

        {/* FOB override legs 2+ */}
        {legNum>1&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+lcBorder}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
            <span style={{fontSize:13,color:C.text}}>Override fuel on board</span>
            <div onClick={()=>onChange({...leg,useOverride:!leg.useOverride})}
              style={{width:44,height:24,borderRadius:12,background:leg.useOverride?C.gold:C.border,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:leg.useOverride?23:3,transition:"left .2s"}}/>
            </div>
          </div>
          {leg.useOverride&&<div style={{marginTop:8}}>
            <Field label="Actual FOB at departure (lbs)" value={leg.fobOverride} onChange={v=>onChange({...leg,fobOverride:v})} step="100" color={lc} legNum={legNum} legContext={(leg.from||"—")+" → "+(leg.to||"—")}/>
          </div>}
          {!leg.useOverride&&r&&r.arrivalFob>0&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>
            Calculated FOB: <span style={{color:lc,fontWeight:600}}>{fL(r.arrivalFob)}</span>
          </div>}
        </div>}

        {r&&<DecisionBadge r={r} sym={sym} from={leg.from} to={leg.to}/>}
      </div>
    </div>
  );
}

// ── Aircraft Form ─────────────────────────────────────────────────────────
function AircraftForm({ac,onSave,onCancel}){
  const[f,setF]=useState(ac);const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const FI=({label,k,step})=>(
    <div style={{marginBottom:12}}>
      <label style={{...LS,color:C.sub}}>{label}</label>
      <input type="number" value={f[k]||""} onChange={e=>u(k,e.target.value)} step={step||"any"}
        style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
    </div>
  );
  return(<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:16,marginBottom:14}}>
    <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:14,textTransform:"uppercase",letterSpacing:.8}}>{ac.id?"Edit":"New"} Aircraft</div>
    <div style={{marginBottom:12}}>
      <label style={{...LS,color:C.sub}}>Aircraft Name</label>
      <input type="text" value={f.name||""} onChange={e=>u("name",e.target.value)}
        style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <FI label="BOW (lbs)" k="bow" step="100"/><FI label="MTOW (lbs)" k="mtow" step="100"/>
      <FI label="MLW (lbs)" k="mlw" step="100"/><FI label="Max Fuel (lbs)" k="maxFuel" step="100"/>
      <FI label="Cruise Burn (lbs/hr)" k="customBurnRate" step="50"/><FI label="Burn Penalty Factor" k="burnPenaltyFactor" step="0.005"/>
    </div>
    <div style={{display:"flex",gap:10,marginTop:4}}>
      <button onClick={()=>onSave(f)} style={{flex:1,background:C.accent,border:"none",borderRadius:9,padding:"13px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Save</button>
      <button onClick={onCancel} style={{background:"transparent",border:"1px solid "+C.border,borderRadius:9,padding:"13px 20px",color:C.muted,fontSize:14,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>);
}

// ── Brief Modal ───────────────────────────────────────────────────────────
function BriefModal({brief,onClose}){
  if(!brief)return null;
  const{legs,results,totalSavings,route,sym,pos,aircraft,reserveFuel,ts}=brief;
  const dc=pos?C.green:C.red;
  const[copied,setCopied]=useState(false);

  function briefToText(){
    const lines=[];
    lines.push("E6B TANKERING BRIEF");
    lines.push(route+" · "+(aircraft.name||"GV")+" · "+ts);
    lines.push(pos?"VERDICT: TANKER":"VERDICT: NO TANKER");
    lines.push("");
    lines.push("TRIP SUMMARY");
    lines.push("Net Savings: "+(pos?"+":"-")+fM(totalSavings,sym));
    lines.push("Total Extra Fuel: "+fL(results.reduce((s,r)=>s+(r?.tankerLbs||0),0)));
    lines.push("Legs: "+legs.length);
    lines.push("Reserve: "+fL(reserveFuel));
    lines.push("");
    legs.forEach((leg,i)=>{
      const r=results[i];if(!r)return;
      const{action,mathRows,narrative}=legExplanation(leg,r,i);
      lines.push("─────────────────────");
      lines.push("LEG "+(i+1)+": "+leg.from+" → "+leg.to);
      if(leg.distNm)lines.push("Distance: "+leg.distNm+"nm");
      if(leg.plannedBurnLbs)lines.push("Planned burn: "+Number(leg.plannedBurnLbs).toLocaleString()+" lbs");
      lines.push("");
      lines.push("DECISION: "+action);
      lines.push("");
      mathRows.forEach(row=>{lines.push(row.l+": "+row.v);});
      lines.push("");
      lines.push("ANALYSIS:");
      narrative.forEach(n=>{lines.push(n);});
      lines.push("");
    });
    lines.push("─────────────────────");
    lines.push("For planning purposes only · Verify with dispatch");
    lines.push(ts);
    return lines.join("\n");
  }

  async function handleCopy(){
    try{
      await navigator.clipboard.writeText(briefToText());
      setCopied(true);setTimeout(()=>setCopied(false),2000);
    }catch{
      // Fallback for sandbox
      const ta=document.createElement("textarea");
      ta.value=briefToText();ta.style.cssText="position:fixed;left:-9999px";
      document.body.appendChild(ta);ta.select();
      try{document.execCommand("copy");setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{}
      document.body.removeChild(ta);
    }
  }

  function legExplanation(leg,r,i){
    const depP=Number(r.depP||0),arrP=Number(r.arrP||0);
    const diff=Number(r.priceDiff||0);
    const be=Number(r.breakEven||0);
    const hrs=Number(r.hrs||0);
    const pen=Number(r.penFactor||0.04);
    const isTanker=r.decision==="TANKER"||r.decision==="MUST TANKER";
    const lc=LEG_COLORS[i%LEG_COLORS.length];

    let action="";
    if(isTanker) action="LOAD "+fL(r.tankerLbs)+" ("+fG(r.tankerLbs)+") at "+leg.from;
    else if(r.decision==="NO PURCHASE") action="NO FUEL at "+leg.from+" — current FOB covers this leg";
    else if(r.fobCoversTrip) action="NO FUEL at "+leg.from+" — depart with current FOB";
    else if(r.arrRampFee>0) action="TRIP FUEL ONLY at "+leg.from+" — cheaper to refuel at "+leg.to;
    else action="TRIP FUEL ONLY at "+leg.from+" — cheaper to refuel at "+leg.to;

    const isNoFuelB=r.decision==="NO PURCHASE"||r.fobCoversTrip;
    const icon=isTanker?"✅":isNoFuelB?"❌":"⛽";
    const bg=isTanker?C.green:isNoFuelB?C.red:C.gold;

    // Build math rows
    const mathRows=[];
    if(depP>0) mathRows.push({l:"Fuel price at "+leg.from,v:sym+depP.toFixed(3)+"/lb  ≈"+sym+(depP*6.7).toFixed(2)+"/gal"});
    if(arrP>0) mathRows.push({l:"Fuel price at "+leg.to,v:sym+arrP.toFixed(3)+"/lb  ≈"+sym+(arrP*6.7).toFixed(2)+"/gal"});
    if(depP>0&&arrP>0) mathRows.push({l:"Price difference",v:(diff>0?"+":"")+sym+diff.toFixed(3)+"/lb  "+(diff>0?"cheaper at "+leg.from:"cheaper at "+leg.to)});
    if(hrs>0) mathRows.push({l:"Estimated flight time",v:hrs.toFixed(2)+" hrs"});
    if(r.baseBurn>0) mathRows.push({l:"Planned fuel burn",v:fL(r.baseBurn)});
    mathRows.push({l:"Trip fuel required (incl. reserve)",v:fL(r.tripFuel)});
    if(r.fob>0) mathRows.push({l:"Fuel on board at departure",v:fL(r.fob)});
    if(r.maxExtra>0) mathRows.push({l:"Max additional fuel possible",v:fL(r.maxExtra)});
    if(hrs>0&&pen>0&&depP>0) mathRows.push({l:"Burn penalty factor",v:(pen*100).toFixed(1)+"% per hr  =  "+sym+(pen*depP).toFixed(3)+"/lb/hr"});
    if(be>0) mathRows.push({l:"Break-even price diff needed",v:sym+be.toFixed(3)+"/lb over "+hrs.toFixed(2)+" hrs"});
    if(r.tankerLbs>0){
      const takeoffFuel=r.tripFuel+r.tankerLbs;
      const fuelToLoad=Math.max(0,takeoffFuel-r.fob);
      mathRows.push({l:"Takeoff fuel (trip + extra)",v:fL(takeoffFuel)});
      mathRows.push({l:"Fuel to load",v:fL(fuelToLoad)+"  ("+fG(fuelToLoad)+")  ("+fLt(fuelToLoad)+")",highlight:true,color:C.green});
      mathRows.push({l:"Of which extra tankering",v:fL(r.tankerLbs)+"  ("+fG(r.tankerLbs)+")"});
      if(depP>0) mathRows.push({l:"Cost to purchase extra fuel",v:sym+(r.tankerLbs*depP).toFixed(2)+" at "+leg.from});
      if(arrP>0) mathRows.push({l:"Cost if bought at destination",v:sym+(r.tankerLbs*arrP).toFixed(2)+" at "+leg.to});
    }
    if(r.depRampFee>0) mathRows.push({l:"Dep ramp fee at "+leg.from,v:sym+Number(r.depRampFee).toFixed(0)+(r.depRampWaived?" (waived by fuel purchase)":" (payable)")});
    if(r.savings!==0) mathRows.push({l:"Net savings / cost",v:(r.savings>0?"+":"")+sym+r.savings.toFixed(2),highlight:true,color:r.savings>0?C.green:C.red});
    if(r.arrivalFob>0) mathRows.push({l:"Arrival FOB",v:fL(r.arrivalFob)+" → carried to next leg"});

    // Build narrative
    const narrative=[];
    if(r.decision==="MUST TANKER"){
      narrative.push("No fuel available at "+leg.to+". You must carry all fuel needed for this leg from "+leg.from+".");
    } else if(r.decision==="NO PURCHASE"){
      narrative.push("Current fuel on board ("+fL(r.fob)+") fully covers the trip fuel requirement of "+fL(r.tripFuel)+" including the "+fL(Number(reserveFuel))+" reserve. No purchase is needed or beneficial at this stop.");
    } else if(isTanker){
      if(diff>0){
        narrative.push("Fuel is "+sym+diff.toFixed(3)+"/lb cheaper at "+leg.from+" than "+leg.to+". After accounting for the burn penalty of "+sym+(pen*depP).toFixed(3)+"/lb per hour over "+hrs.toFixed(2)+" hours (break-even: "+sym+be.toFixed(3)+"/lb), the price advantage of "+sym+diff.toFixed(3)+"/lb still exceeds the cost of carrying the fuel.");
      }
      if(r.depRampFee>0&&r.depRampWaived){
        narrative.push("The "+sym+Number(r.depRampFee).toFixed(0)+" departure ramp fee at "+leg.from+" is waived by the fuel purchase.");
      }
      narrative.push("Net result: loading "+fL(r.tankerLbs)+" at "+leg.from+" saves "+sym+r.savings.toFixed(2)+" compared to buying at "+leg.to+".");
    } else {
      // NO TANKER
      if(r.fobCoversTrip){
        narrative.push("Current FOB ("+fL(r.fob)+") already covers trip fuel ("+fL(r.tripFuel)+"). No additional fuel purchase needed at "+leg.from+".");
      } else if(diff<=0){
        narrative.push("Fuel at "+leg.to+" ("+sym+arrP.toFixed(3)+"/lb) is cheaper than "+leg.from+" ("+sym+depP.toFixed(3)+"/lb). Load trip fuel only — no extra.");
      } else if(diff>0&&diff<=be){
        narrative.push("Although fuel is "+sym+diff.toFixed(3)+"/lb cheaper at "+leg.from+", the burn penalty of "+sym+(pen*depP).toFixed(3)+"/lb per hour over "+hrs.toFixed(2)+" hours requires a price difference of at least "+sym+be.toFixed(3)+"/lb to break even. Carrying extra fuel would cost more than it saves.");
      }
      if(r.depRampFee>0&&r.depRampOwed){
        narrative.push("A departure ramp fee of "+sym+Number(r.depRampFee).toFixed(0)+" applies at "+leg.from+".");
      }
      if(r.fobCoversTrip){
        narrative.push("Depart "+leg.from+" with current fuel. No purchase needed.");
      } else {
        narrative.push("Load trip fuel only at "+leg.from+". Refuel at "+leg.to+" on arrival.");
      }
    }

    return{action,icon,bg,lc,mathRows,narrative};
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:2000,background:C.bg,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>

      {/* Header */}
      <div style={{background:C.panel,padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1,borderBottom:"1px solid "+C.border}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:C.light,letterSpacing:.3}}>⛽ Tankering Brief</div>
          <div style={{fontSize:11,color:C.sub,marginTop:2}}>{route} · {aircraft.name||"GV"} · {ts}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={handleCopy}
            style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,
              background:copied?C.green+"22":C.panel,color:copied?C.green:C.sub,
              border:"1px solid "+(copied?C.green+"55":C.border),cursor:"pointer"}}>
            {copied?"✓ Copied":"📋 Copy"}
          </button>
          <span style={{padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:700,background:dc+"22",color:dc,border:"1.5px solid "+dc+"55"}}>
            {pos?"TANKER":"NO TANKER"}
          </span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.sub,fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>✕</button>
        </div>
      </div>

      <div style={{padding:"14px 14px 60px"}}>

        {/* Trip summary */}
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Trip Summary</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[
              {l:"Net Savings",v:(pos?"+":"-")+fM(totalSavings,sym),c:dc},
              {l:"Total Extra Fuel",v:fL(results.reduce((s,r)=>s+(r?.tankerLbs||0),0)),c:C.text},
              {l:"Legs",v:String(legs.length),c:C.gold},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:C.bg,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:.4}}>{l}</div>
                <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
            Reserve fuel: {fL(reserveFuel)} · Aircraft: {aircraft.name||"GV"}
          </div>
        </div>

        {/* Per-leg detailed analysis */}
        {legs.map((leg,i)=>{
          const r=results[i];if(!r)return null;
          const{action,icon,bg,lc,mathRows,narrative}=legExplanation(leg,r,i);
          return(
            <div key={i} style={{marginBottom:18}}>
              {/* Leg header */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{background:lc,borderRadius:7,padding:"3px 12px",fontSize:11,fontWeight:800,color:"#fff"}}>LEG {i+1}</div>
                <div style={{fontSize:15,fontWeight:800,color:C.text,letterSpacing:.5}}>{leg.from} → {leg.to}</div>
                <div style={{fontSize:11,color:C.muted}}>{leg.distNm&&leg.distNm+"nm"}{leg.plannedBurnLbs&&" · "+Number(leg.plannedBurnLbs).toLocaleString()+" lbs burn"}</div>
              </div>

              {/* Verdict banner */}
              <div style={{background:bg+"18",border:"2px solid "+bg+"55",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
                <span style={{fontSize:14,fontWeight:800,color:bg,lineHeight:1.3}}>{action}</span>
              </div>

              {/* Math table */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",marginBottom:10}}>
                <div style={{padding:"8px 12px",background:C.panel,fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8}}>
                  Calculation Detail
                </div>
                {mathRows.map((row,j)=>(
                  <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderTop:"1px solid "+C.border,background:row.highlight?row.color+"12":"transparent"}}>
                    <span style={{fontSize:12,color:row.highlight?row.color:C.muted,fontWeight:row.highlight?700:400,flex:1}}>{row.l}</span>
                    <span style={{fontSize:12,color:row.highlight?row.color:C.text,fontWeight:row.highlight?800:600,textAlign:"right",marginLeft:12}}>{row.v}</span>
                  </div>
                ))}
              </div>

              {/* Plain language narrative */}
              <div style={{background:lc+"0e",border:"1px solid "+lc+"33",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:10,fontWeight:700,color:lc,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Analysis</div>
                {narrative.map((line,j)=>(
                  <div key={j} style={{fontSize:13,color:C.text,lineHeight:1.8,marginBottom:j<narrative.length-1?8:0,paddingBottom:j<narrative.length-1?8:0,borderBottom:j<narrative.length-1?"1px solid "+lc+"22":"none"}}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:16,lineHeight:1.7,padding:"12px",background:C.card,borderRadius:8,border:"1px solid "+C.border}}>
          E6B Fuel Tankering · Global Air Charters<br/>
          For planning purposes only · Verify all data with dispatch before flight<br/>
          {ts}
        </div>
      </div>
    </div>
  );
}


// ── PCN/ACN & PCR/ACR Calculator ─────────────────────────────────────────
const PCN_STEPS=[
  {key:"num",label:"PCN / PCR VALUE",color:"#8a7a5a"},
  {key:"pav",label:"PAVEMENT TYPE",color:"#4a7fa5"},
  {key:"sub",label:"SUBGRADE STRENGTH",color:"#5a8f7a"},
  {key:"tire",label:"TIRE PRESSURE",color:"#7a5a8a"},
  {key:"cls",label:"CLASSIFICATION",color:"#6a8fa8"},
];
const PAV_OPTS=[{v:"F",label:"Flexible",desc:"Asphalt"},{v:"R",label:"Rigid",desc:"Concrete"}];
const SUB_OPTS=[
  {v:"A",label:"High",detail:"CBR ≥ 15 · k = 150",detailPCR:"E = 29,008"},
  {v:"B",label:"Medium",detail:"CBR = 10 · k = 80",detailPCR:"E = 17,405"},
  {v:"C",label:"Low",detail:"CBR = 6 · k = 40",detailPCR:"E = 11,603"},
  {v:"D",label:"Ultra Low",detail:"CBR = 3 · k = 20",detailPCR:"E = 7,252"},
];
const TIRE_OPTS=[
  {v:"W",label:"Unlimited",psi:"No limit",ok:true},
  {v:"X",label:"High",psi:"≤ 254 psi",ok:true},
  {v:"Y",label:"Medium",psi:"≤ 181 psi",ok:false},
  {v:"Z",label:"Low",psi:"≤ 73 psi",ok:false},
];
const CLS_OPTS=[{v:"T",label:"Technical",desc:"Engineering evaluation"},{v:"U",label:"Experience",desc:"Aircraft usage history"}];

function PavementCalc(){
  const wide=useWide();
  const[inputMode,setInputMode]=useState("guided"); // "guided" or "paste"
  // Guided state
  const[gStep,setGStep]=useState(0);
  const[gNum,setGNum]=useState("");
  const[gPav,setGPav]=useState("");
  const[gSub,setGSub]=useState("");
  const[gTire,setGTire]=useState("");
  const[gCls,setGCls]=useState("");
  const[gDone,setGDone]=useState(false);
  const[gFlash,setGFlash]=useState(null);
  // Paste state
  const[pasteVal,setPasteVal]=useState("");
  const[pasteError,setPasteError]=useState("");
  const[pasteParsed,setPasteParsed]=useState(null);
  // Shared
  const[weight,setWeight]=useState("90500");
  const[showWtPad,setShowWtPad]=useState(false);
  const[showExplain,setShowExplain]=useState(false);
  const[result,setResult]=useState(null);

  const isPCR=Number(gNum||0)>100||(pasteParsed&&pasteParsed.pcn>100);

  // ── Guided helpers ──
  function gPressNum(k){
    if(k==="⌫"){setGNum(v=>v.slice(0,-1));return;}
    if(k==="."){if(gNum.includes("."))return;setGNum(v=>v+".");return;}
    if(k==="C"){setGNum("");return;}
    setGNum(v=>v==="0"?k:v+k);
  }
  function gConfirmNum(){if(!gNum)return;doFlash(0);setGStep(1);}
  function gPickPav(v){setGPav(v);doFlash(1);setTimeout(()=>setGStep(2),180);}
  function gPickSub(v){setGSub(v);doFlash(2);setTimeout(()=>setGStep(3),180);}
  function gPickTire(v){setGTire(v);doFlash(3);setTimeout(()=>setGStep(4),180);}
  function gPickCls(v){setGCls(v);doFlash(4);setTimeout(()=>setGDone(true),180);}
  function doFlash(i){setGFlash(i);setTimeout(()=>setGFlash(null),300);}
  function gReset(){setGStep(0);setGNum("");setGPav("");setGSub("");setGTire("");setGCls("");setGDone(false);setResult(null);}
  function gBack(){
    if(gDone){setGDone(false);setGCls("");setGStep(4);return;}
    if(gStep===4){setGCls("");setGStep(3);return;}
    if(gStep===3){setGTire("");setGStep(2);return;}
    if(gStep===2){setGSub("");setGStep(1);return;}
    if(gStep===1){setGPav("");setGStep(0);return;}
  }
  function gBuildParts(){
    const p=[gNum||"—"];
    if(gStep>0||gPav)p.push(gPav||"—");
    if(gStep>1||gSub)p.push(gSub||"—");
    if(gStep>2||gTire)p.push(gTire||"—");
    if(gStep>3||gCls)p.push(gCls||"—");
    return p;
  }

  // ── Paste helpers ──
  function handlePaste(){
    const t=pasteVal.trim();
    if(!t){setPasteError("Enter a PCN/PCR string");return;}
    const p=parsePcnString(t);
    if(!p){setPasteError("Invalid format — use: 24/F/C/Y/T");setPasteParsed(null);return;}
    setPasteError("");setPasteParsed(p);
  }
  function pasteReset(){setPasteVal("");setPasteError("");setPasteParsed(null);setResult(null);}

  // ── Mode switch ──
  function switchMode(m){setInputMode(m);if(m==="guided")pasteReset();else gReset();}

  // ── Calculate ──
  function doCalc(pcnNum,pType,sub,tire){
    setShowExplain(false);
    const w=Number(weight||90500);
    const md=pcnNum>100?"acr":"acn";
    const acVal=md==="acr"?getAcr(w,pType,sub):getAcn(w,pType,sub);
    const tireLimit=TIRE_LIMITS[tire]||9999;
    const tirePasses=GV_MAX_TIRE_PSI<=tireLimit;
    const strengthPasses=acVal<=pcnNum;
    setResult({suitable:strengthPasses&&tirePasses,strengthPasses,tirePasses,
      acnLabel:md==="acr"?"ACR":"ACN",pcrLabel:md==="acr"?"PCR":"PCN",
      acVal:Math.round(acVal*10)/10,pcnNum,tireLimit,tireCat:tire,
      weight:w,pavType:pType,subgrade:sub,mode:md});
  }
  function calcGuided(){doCalc(Number(gNum),gPav,gSub,gTire);}
  function calcPaste(){if(pasteParsed)doCalc(pasteParsed.pcn,pasteParsed.pavementType,pasteParsed.subgrade,pasteParsed.tireCat);}

  const gParts=gBuildParts();
  const activeColor=PCN_STEPS[gStep]?PCN_STEPS[gStep].color:C.accent;
  const numRows=[["7","8","9"],["4","5","6"],["1","2","3"],[".","0","⌫"]];

  return(<>
    {/* Input mode toggle */}
    <div style={{display:"flex",gap:0,marginBottom:14,background:C.panel,borderRadius:10,padding:3,border:"1px solid "+C.border}}>
      {[{m:"guided",icon:"🔢",l:"Guided Entry"},{m:"paste",icon:"📋",l:"Paste / Type"}].map(({m,icon,l})=>(
        <button key={m} onClick={()=>switchMode(m)}
          style={{flex:1,padding:"10px 8px",borderRadius:8,border:"none",
            background:inputMode===m?C.accent+"22":"transparent",color:inputMode===m?C.accent:C.muted,
            fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:14}}>{icon}</span> {l}
        </button>
      ))}
    </div>

    {/* Weight input — shared */}
    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Gross Weight (lbs)</div>
      <input readOnly value={weight} onClick={()=>setShowWtPad(true)}
        style={{width:"100%",background:C.accent+"0d",border:"1.5px solid "+C.accent+"55",borderRadius:8,
          padding:"10px 12px",color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box",cursor:"pointer"}}/>
    </div>

    {/* ══ PASTE MODE ══ */}
    {inputMode==="paste"&&!pasteParsed&&!result&&(
      <div style={{background:C.card,border:"1px solid "+C.accent+"44",borderRadius:12,padding:16,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Paste from Jeppesen</div>
        <div style={{background:C.bg,borderRadius:10,padding:"14px 16px",border:"1.5px solid "+(pasteError?C.red+"88":C.accent+"44"),marginBottom:10}}>
          <input type="text" value={pasteVal} onChange={e=>{setPasteVal(e.target.value.toUpperCase());setPasteError("")}}
            placeholder="24/F/C/Y/T" autoComplete="off" autoCapitalize="characters"
            style={{width:"100%",background:"transparent",border:"none",color:C.text,fontSize:24,fontWeight:800,
              outline:"none",letterSpacing:2,fontFamily:"monospace",textAlign:"center"}}/>
        </div>
        {pasteError&&<div style={{fontSize:12,color:C.red,fontWeight:600,textAlign:"center",marginBottom:8}}>{pasteError}</div>}
        <div style={{fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.6,marginBottom:14}}>
          Format: <span style={{color:C.gold}}>Value</span><span style={{opacity:.4}}> / </span>
          <span style={{color:C.accent}}>Pvmt</span><span style={{opacity:.4}}> / </span>
          <span style={{color:"#5a8f7a"}}>Sub</span><span style={{opacity:.4}}> / </span>
          <span style={{color:"#7a5a8a"}}>Tire</span><span style={{opacity:.4}}> / </span>
          <span style={{color:C.sub}}>Cls</span>
        </div>
        <button onClick={handlePaste} disabled={!pasteVal.trim()}
          style={{width:"100%",padding:14,borderRadius:10,border:"none",
            background:pasteVal.trim()?"linear-gradient(135deg,"+C.accent+",#2a5f85)":C.panel,
            color:pasteVal.trim()?"#fff":C.muted,fontSize:16,fontWeight:800,
            cursor:pasteVal.trim()?"pointer":"default",opacity:pasteVal.trim()?1:.5}}>
          Parse
        </button>
        {/* Quick ref */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14,fontSize:11}}>
          {[{l:"Pavement",items:"F = Flexible · R = Rigid"},{l:"Subgrade",items:"A = High · B = Med · C = Low · D = Ultra Low"},{l:"Tire",items:"W = Unlimited · X = High · Y = Med · Z = Low"},{l:"Class",items:"T = Technical · U = Experience"}].map(({l,items})=>(
            <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontWeight:700,color:C.sub,marginBottom:3}}>{l}</div>
              <div style={{color:C.muted,lineHeight:1.5,fontSize:10}}>{items}</div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Paste decoded → calculate */}
    {inputMode==="paste"&&pasteParsed&&!result&&(
      <div style={{marginBottom:14}}>
        <div style={{background:C.green+"12",border:"2px solid "+C.green+"44",borderRadius:14,padding:"16px 14px",textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>✓ Parsed</div>
          <div style={{fontSize:26,fontWeight:900,color:C.text,letterSpacing:2,fontFamily:"monospace",marginBottom:10}}>
            {pasteParsed.pcn}/{pasteParsed.pavementType}/{pasteParsed.subgrade}/{pasteParsed.tireCat}/{pasteParsed.classification}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,textAlign:"left"}}>
            {[{l:pasteParsed.pcn>100?"PCR":"PCN",v:String(pasteParsed.pcn)},{l:"Pavement",v:pasteParsed.pavementType==="F"?"Flexible":"Rigid"},{l:"Subgrade",v:pasteParsed.subgrade+" — "+(SUB_OPTS.find(s=>s.v===pasteParsed.subgrade)||{}).label},{l:"Tire",v:pasteParsed.tireCat+" — "+(TIRE_OPTS.find(t=>t.v===pasteParsed.tireCat)||{}).label}].map(({l,v})=>(
              <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.6}}>{l}</div>
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {(pasteParsed.tireCat==="Y"||pasteParsed.tireCat==="Z")&&(
          <div style={{background:C.red+"15",border:"1.5px solid "+C.red+"44",borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div style={{fontSize:12,color:C.red,lineHeight:1.5}}>
              <strong>Tire restriction.</strong> GV 198 PSI exceeds {pasteParsed.tireCat==="Y"?"181":"73"} PSI limit (cat {pasteParsed.tireCat}).
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <button onClick={pasteReset} style={{flex:1,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>Clear</button>
          <button onClick={calcPaste} style={{flex:2,padding:14,borderRadius:12,background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",letterSpacing:.3}}>Calculate →</button>
        </div>
      </div>
    )}

    {/* ══ GUIDED MODE ══ */}
    {inputMode==="guided"&&!result&&<>
      {/* Chip display */}
      <div style={{background:C.card,border:"1.5px solid "+(gDone?C.green+"44":activeColor+"44"),borderRadius:14,padding:"14px 12px",marginBottom:12}}>
        <div style={{display:"flex",gap:3,alignItems:"center",justifyContent:"center",flexWrap:"wrap",marginBottom:8}}>
          {gParts.map((p,i)=>{
            const isActive=i===gStep&&!gDone;const isFilled=p!=="—";const sc=PCN_STEPS[i]?PCN_STEPS[i].color:C.muted;
            return(<div key={i} style={{display:"flex",alignItems:"center",gap:2}}>
              {i>0&&<span style={{fontSize:18,fontWeight:300,color:C.muted,opacity:.35,lineHeight:1}}>/</span>}
              <div style={{background:isActive?sc+"22":isFilled?sc+"12":C.bg,border:"2px solid "+(isActive?sc:isFilled?sc+"55":C.border),borderRadius:8,padding:i===0?"6px 12px":"6px 9px",minWidth:i===0?48:28,textAlign:"center",transition:"all 0.2s",transform:gFlash===i?"scale(1.08)":"scale(1)",boxShadow:isActive?"0 0 14px "+sc+"22":"none"}}>
                <div style={{fontSize:i===0?20:17,fontWeight:800,color:isFilled?sc:C.muted+"55",letterSpacing:1,lineHeight:1.1}}>{p}</div>
                <div style={{fontSize:7,fontWeight:700,color:sc,textTransform:"uppercase",letterSpacing:.6,marginTop:2,opacity:.6}}>
                  {["Value","Pvmt","Sub","Tire","Cls"][i]}
                </div>
              </div>
            </div>);
          })}
        </div>
        <div style={{display:"flex",gap:3,justifyContent:"center",marginBottom:4}}>
          {PCN_STEPS.map((s,i)=><div key={i} style={{height:3,flex:1,maxWidth:40,borderRadius:2,background:i<gStep||gDone?s.color:i===gStep&&!gDone?s.color+"88":C.border}}/>)}
        </div>
        {!gDone&&<div style={{textAlign:"center",fontSize:10,fontWeight:700,color:activeColor,textTransform:"uppercase",letterSpacing:1}}>{PCN_STEPS[gStep]?PCN_STEPS[gStep].label:""}</div>}
      </div>

      {gStep>0&&!gDone&&<button onClick={gBack} style={{background:"transparent",border:"none",color:C.muted,fontSize:12,fontWeight:600,cursor:"pointer",padding:"0 0 8px",display:"flex",alignItems:"center",gap:4}}>← Back</button>}

      {/* Step 0: Numpad */}
      {gStep===0&&!gDone&&<div style={{display:"flex",flexDirection:"column",gap:7}}>
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:2,lineHeight:1.5}}>
          Enter the value from Jeppesen charts
          {gNum&&Number(gNum)>100&&<span style={{color:C.gold,fontWeight:700}}> · PCR mode</span>}
        </div>
        {numRows.map((row,ri)=>(
          <div key={ri} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
            {row.map(k=>(
              <button key={k} onClick={()=>gPressNum(k)}
                style={{padding:"16px 0",fontSize:k==="⌫"?19:22,fontWeight:700,
                  background:k==="⌫"?"#1e3050":C.card,color:C.text,border:"1.5px solid "+C.border,
                  borderRadius:11,cursor:"pointer",lineHeight:1,WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                {k}
              </button>
            ))}
          </div>
        ))}
        <button onClick={gConfirmNum} disabled={!gNum}
          style={{width:"100%",marginTop:2,background:gNum?"linear-gradient(135deg,"+C.gold+","+C.gold+"bb)":C.card,
            border:"none",borderRadius:11,padding:14,color:gNum?"#fff":C.muted,
            fontSize:15,fontWeight:800,cursor:gNum?"pointer":"default",opacity:gNum?1:.5}}>
          Next → Pavement Type
        </button>
      </div>}

      {/* Step 1: Pavement */}
      {gStep===1&&!gDone&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:2}}>Runway pavement type</div>
        {PAV_OPTS.map(opt=>(
          <button key={opt.v} onClick={()=>gPickPav(opt.v)}
            style={{background:C.card,border:"2px solid "+C.accent+"44",borderRadius:14,padding:"18px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:48,height:48,borderRadius:11,background:"linear-gradient(135deg,"+C.accent+"33,"+C.accent+"11)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:C.accent,flexShrink:0}}>{opt.v}</div>
            <div><div style={{fontSize:17,fontWeight:800,color:C.text}}>{opt.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{opt.desc}</div></div>
          </button>
        ))}
      </div>}

      {/* Step 2: Subgrade */}
      {gStep===2&&!gDone&&<div style={{display:"flex",flexDirection:"column",gap:7}}>
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:2}}>Subgrade bearing strength</div>
        {SUB_OPTS.map(opt=>(
          <button key={opt.v} onClick={()=>gPickSub(opt.v)}
            style={{background:C.card,border:"2px solid #5a8f7a33",borderRadius:14,padding:"14px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:10,background:"linear-gradient(135deg,#5a8f7a33,#5a8f7a11)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#5a8f7a",flexShrink:0}}>{opt.v}</div>
            <div><div style={{fontSize:15,fontWeight:800,color:C.text}}>{opt.label}</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>{isPCR?opt.detailPCR:opt.detail}</div></div>
          </button>
        ))}
      </div>}

      {/* Step 3: Tire */}
      {gStep===3&&!gDone&&<div style={{display:"flex",flexDirection:"column",gap:7}}>
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:2}}>Tire pressure limit · GV: 198 PSI</div>
        {TIRE_OPTS.map(opt=>{const warn=!opt.ok;return(
          <button key={opt.v} onClick={()=>gPickTire(opt.v)}
            style={{background:C.card,border:"2px solid "+(warn?C.red+"44":"#7a5a8a33"),borderRadius:14,padding:"14px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:10,background:warn?"linear-gradient(135deg,"+C.red+"33,"+C.red+"11)":"linear-gradient(135deg,#7a5a8a33,#7a5a8a11)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:warn?C.red:"#7a5a8a",flexShrink:0}}>{opt.v}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:15,fontWeight:800,color:C.text}}>{opt.label}</span>
                {warn&&<span style={{fontSize:8,fontWeight:800,color:C.red,background:C.red+"18",padding:"2px 6px",borderRadius:4,letterSpacing:.5}}>GV EXCEEDS</span>}
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:1}}>{opt.psi}</div>
            </div>
          </button>
        );})}
      </div>}

      {/* Step 4: Classification */}
      {gStep===4&&!gDone&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:2}}>How was the {isPCR?"PCR":"PCN"} determined?</div>
        {CLS_OPTS.map(opt=>(
          <button key={opt.v} onClick={()=>gPickCls(opt.v)}
            style={{background:C.card,border:"2px solid "+C.sub+"33",borderRadius:14,padding:"18px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:48,height:48,borderRadius:11,background:"linear-gradient(135deg,"+C.sub+"33,"+C.sub+"11)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:C.sub,flexShrink:0}}>{opt.v}</div>
            <div><div style={{fontSize:17,fontWeight:800,color:C.text}}>{opt.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{opt.desc}</div></div>
          </button>
        ))}
      </div>}

      {/* Guided done → calculate */}
      {gDone&&<div style={{display:"flex",gap:10}}>
        <button onClick={gReset} style={{flex:1,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>Clear</button>
        <button onClick={calcGuided} style={{flex:2,padding:14,borderRadius:12,background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",letterSpacing:.3}}>Calculate →</button>
      </div>}
    </>}

    {/* ══ RESULT ══ */}
    {result&&!result.error&&(
      <div style={{marginBottom:14}}>
        <div style={{background:(result.suitable?C.green:C.red)+"18",border:"2px solid "+(result.suitable?C.green:C.red)+"55",borderRadius:12,padding:"16px 14px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:6}}>{result.suitable?"✅":"❌"}</div>
          <div style={{fontSize:18,fontWeight:900,color:result.suitable?C.green:C.red,letterSpacing:.5}}>
            {result.suitable?"RUNWAY SUITABLE":"NOT SUITABLE"}
          </div>
          {!result.suitable&&<div style={{fontSize:13,color:C.muted,marginTop:6}}>
            {!result.strengthPasses&&`${result.acnLabel} (${result.acVal}) exceeds ${result.pcrLabel} (${result.pcnNum})`}
            {!result.strengthPasses&&!result.tirePasses&&" · "}
            {!result.tirePasses&&`Tire pressure ${GV_MAX_TIRE_PSI} psi exceeds ${TIRE_LIMITS[result.tireCat]} psi limit`}
          </div>}
        </div>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"8px 12px",background:C.panel,fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8}}>Assessment Detail</div>
          {[
            {l:"Gross Weight",v:Number(result.weight).toLocaleString()+" lbs"},
            {l:"Pavement Type",v:result.pavType==="F"?"Flexible":"Rigid"},
            {l:"Subgrade",v:SUBGRADE_LABELS[result.subgrade]+" ("+result.subgrade+") — "+(result.mode==="acr"?SUBGRADE_E[result.subgrade]:result.pavType==="F"?SUBGRADE_CBR[result.subgrade]:SUBGRADE_K[result.subgrade])},
            {l:result.acnLabel+" (Aircraft)",v:String(result.acVal),highlight:true,color:result.strengthPasses?C.green:C.red},
            {l:result.pcrLabel+" (Runway)",v:String(result.pcnNum),highlight:true,color:result.strengthPasses?C.green:C.red},
            {l:"Strength Check",v:result.strengthPasses?`${result.acnLabel} ≤ ${result.pcrLabel} ✓`:`${result.acnLabel} > ${result.pcrLabel} ✗`,color:result.strengthPasses?C.green:C.red},
            {l:"GV Tire Pressure",v:GV_MAX_TIRE_PSI+" psi"},
            {l:"Runway Tire Limit",v:TIRE_LABELS[result.tireCat]},
            {l:"Tire Check",v:result.tirePasses?"Within limit ✓":"Exceeds limit ✗",color:result.tirePasses?C.green:C.red},
          ].map((row,j)=>(
            <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderTop:"1px solid "+C.border,background:row.highlight?(row.color||C.text)+"0c":"transparent"}}>
              <span style={{fontSize:12,color:row.color||C.muted,fontWeight:row.highlight?700:400,flex:1}}>{row.l}</span>
              <span style={{fontSize:12,color:row.color||C.text,fontWeight:row.highlight?800:600,textAlign:"right",marginLeft:12}}>{row.v}</span>
            </div>
          ))}
        </div>
        {!result.strengthPasses&&(
          <div style={{background:C.gold+"12",border:"1px solid "+C.gold+"44",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:C.gold,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Maximum Weight for this Runway</div>
            <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>
              {(()=>{
                const tbl=result.mode==="acr"?(result.pavType==="F"?ACR_FLEX:ACR_RIGID):(result.pavType==="F"?ACN_FLEX:ACN_RIGID);
                const wts=result.mode==="acr"?(result.pavType==="F"?ACR_FLEX_WEIGHTS:ACR_RIGID_WEIGHTS):ACN_WEIGHTS;
                const vals=tbl[result.subgrade]||tbl.B;
                let maxWt=0;
                for(let w=wts[0];w<=wts[wts.length-1];w+=100){if(lerp(wts,vals,w)<=result.pcnNum)maxWt=w;}
                if(maxWt>0)return `Reduce gross weight to approximately ${maxWt.toLocaleString()} lbs or below for unrestricted operations.`;
                return "Aircraft exceeds pavement strength at all weights in the data range.";
              })()}
            </div>
          </div>
        )}
        <div style={{fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.7,padding:"10px",background:C.card,borderRadius:8,border:"1px solid "+C.border}}>
          {result.mode==="acr"?"ACR/PCR per GV AOM Rev 42 §06-01-20":"ACN/PCN per GV Performance Handbook §03-03-50"}<br/>
          Tire: H35×11R18 · Spacing: 18.5″ · Max pressure: 198 PSI · WoM: ~91%<br/>
          For planning purposes only — verify with dispatch
        </div>

        {/* Explain button */}
        <button onClick={()=>setShowExplain(!showExplain)}
          style={{width:"100%",marginTop:12,padding:"14px 16px",borderRadius:12,
            background:showExplain?C.accent+"15":C.card,border:"1.5px solid "+(showExplain?C.accent+"66":C.accent+"44"),
            color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:18}}>💡</span>
          {showExplain?"Hide Explanation":"Explain in Plain English"}
          <span style={{fontSize:12,display:"inline-block",transition:"transform 0.2s",transform:showExplain?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
        </button>

        {/* Explanation panel */}
        {showExplain&&(()=>{
          const lines=[];
          const isACR=result.mode==="acr";
          const acL=result.acnLabel,pcL=result.pcrLabel;
          const pavName=result.pavType==="F"?"flexible (asphalt)":"rigid (concrete)";
          const subName=SUBGRADE_LABELS[result.subgrade]||"Medium";

          lines.push({type:"context",icon:"📍",
            text:`You're evaluating a ${Number(result.weight).toLocaleString()} lb aircraft against runway pavement rated ${result.pcnNum}/${result.pavType}/${result.subgrade}/${result.tireCat}.`});

          if(isACR)lines.push({type:"info",icon:"ℹ️",
            text:"This runway uses the newer ACR/PCR rating system, which measures pavement strength using the elastic modulus of the subgrade for improved accuracy over the legacy ACN/PCN system."});

          lines.push({type:"info",icon:"ℹ️",
            text:`The runway has ${pavName} pavement with ${subName.toLowerCase()} subgrade strength (category ${result.subgrade}).`});

          lines.push({type:"calc",icon:"🔢",
            text:`At ${Number(result.weight).toLocaleString()} lbs on ${pavName} pavement with ${subName.toLowerCase()} subgrade, the GV's ${acL} is ${result.acVal}.`});

          if(result.strengthPasses){
            lines.push({type:"pass",icon:"✅",
              text:`The aircraft ${acL} of ${result.acVal} is less than the runway ${pcL} of ${result.pcnNum}. The pavement can handle this weight without restriction.`});
          }else{
            const pct=Math.round(((result.acVal-result.pcnNum)/result.pcnNum)*100);
            lines.push({type:"fail",icon:"❌",
              text:`The aircraft ${acL} of ${result.acVal} exceeds the runway ${pcL} of ${result.pcnNum} by ${pct}%. The aircraft is too heavy for this pavement — operating at this weight risks accelerated pavement degradation.`});
          }

          if(result.tireCat==="W"){
            lines.push({type:"pass",icon:"✅",
              text:`The runway has no tire pressure restriction (category W — unlimited). The GV's 198 PSI tire pressure is acceptable.`});
          }else if(result.tirePasses){
            lines.push({type:"pass",icon:"✅",
              text:`The runway's tire pressure limit is ${TIRE_LIMITS[result.tireCat]} PSI (category ${result.tireCat}). The GV's 198 PSI is within this limit.`});
          }else{
            lines.push({type:"fail",icon:"❌",
              text:`The runway's tire pressure limit is ${TIRE_LIMITS[result.tireCat]} PSI (category ${result.tireCat}). The GV's 198 PSI exceeds this limit. Even if the weight is acceptable, the tire pressure restriction prevents unrestricted operations.`});
          }

          if(result.suitable){
            lines.push({type:"verdict-pass",icon:"🟢",
              text:`Both the pavement strength and tire pressure checks pass. This runway is suitable for unrestricted operations at ${Number(result.weight).toLocaleString()} lbs.`});
          }else{
            const reasons=[];
            if(!result.strengthPasses)reasons.push("pavement strength is insufficient");
            if(!result.tirePasses)reasons.push("tire pressure exceeds the runway limit");
            lines.push({type:"verdict-fail",icon:"🔴",
              text:`This runway is not suitable because ${reasons.join(" and ")}. Consider reducing gross weight or selecting an alternate runway with a higher ${pcL} rating.`});
          }

          return(
            <div style={{marginTop:12,borderRadius:14,overflow:"hidden",border:"1.5px solid "+C.accent+"33",background:C.card}}>
              <div style={{padding:"10px 14px",background:C.panel,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid "+C.border}}>
                <span style={{fontSize:16}}>💡</span>
                <div>
                  <div style={{fontSize:12,fontWeight:800,color:C.light}}>What This Means</div>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>Plain English breakdown of your {acL}/{pcL} assessment</div>
                </div>
              </div>
              <div style={{padding:"12px 14px"}}>
                {lines.map((line,i)=>{
                  const isV=line.type.startsWith("verdict");
                  const vc=line.type==="verdict-pass"||line.type==="pass"?C.green:line.type==="verdict-fail"||line.type==="fail"?C.red:line.type==="calc"?C.gold:C.sub;
                  return(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",
                      padding:isV?"14px 12px":"10px 0",marginBottom:i<lines.length-1?4:0,
                      borderBottom:!isV&&i<lines.length-1?"1px solid "+C.border:"none",
                      background:isV?vc+"12":"transparent",borderRadius:isV?10:0,
                      marginTop:isV?8:0,border:isV?"1.5px solid "+vc+"33":"none"}}>
                      <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{line.icon}</span>
                      <div style={{fontSize:13,color:isV?vc:C.text,lineHeight:1.7,fontWeight:isV?700:400}}>{line.text}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"10px 14px",borderTop:"1px solid "+C.border,fontSize:10,color:C.muted,textAlign:"center",lineHeight:1.5}}>
                {result.mode==="acr"?"ACR/PCR per GV AOM Rev 42 §06-01-20":"ACN/PCN per GV PH §03-03-50"} · For planning purposes only
              </div>
            </div>
          );
        })()}

        <button onClick={()=>{setResult(null);setShowExplain(false);if(inputMode==="guided")gReset();else pasteReset();}}
          style={{width:"100%",marginTop:12,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>
          ← New Calculation
        </button>
      </div>
    )}

    {result&&result.error&&(
      <div style={{background:C.red+"18",border:"1.5px solid "+C.red+"55",borderRadius:10,padding:14,textAlign:"center",color:C.red,fontSize:14,fontWeight:700}}>
        {result.error}
      </div>
    )}

    {/* Weight numpad overlay */}
    {showWtPad&&<NumPadOverlay onClose={()=>setShowWtPad(false)}>
      <NumPad value={weight} label="Gross Weight (lbs)" step="100"
        onChange={v=>{setWeight(v);setShowWtPad(false);}}
        onClose={()=>setShowWtPad(false)}/>
    </NumPadOverlay>}
  </>);
}

// ── Wind Keyboard Component ──────────────────────────────────────────────
function WindPad({value,onDone,onClose}){
  const[wVal,setWVal]=useState(value||"");
  function wPress(k){
    if(k==="⌫"){setWVal(v=>v.slice(0,-1));return;}
    if(k==="C"){setWVal("");return;}
    if(k==="/"){if(wVal.includes("/"))return;setWVal(v=>v+"/");return;}
    if(k==="G"){if(!wVal.includes("/")||wVal.includes("G"))return;setWVal(v=>v+"G");return;}
    setWVal(v=>v+k);
  }
  const pm=wVal.replace(/\s+/g,"").toUpperCase().match(/^(\d{0,3})(\/)?(\d*)(G)?(\d*)$/);
  const dirPart=pm?pm[1]:"";const hasSep=pm?!!pm[2]:false;const spdPart=pm?pm[3]:"";const hasG=pm?!!pm[4]:false;const gustPart=pm?pm[5]:"";
  const wc="#5a8f7a";
  const rows=[["7","8","9"],["4","5","6"],["1","2","3"],["C","0","⌫"]];
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100vw",maxWidth:"100vw",zIndex:1000,background:"#1b2a4a",borderTop:"2px solid "+wc,borderRadius:"16px 16px 0 0",padding:"12px 20px 40px",boxSizing:"border-box",boxShadow:"0 -8px 40px #000c"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontSize:12,color:wc,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Wind Entry</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>Direction / Speed G Gust</div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6a8fa8",fontSize:22,cursor:"pointer",padding:"4px 10px",lineHeight:1}}>✕</button>
      </div>
      <div style={{background:"#0f1829",borderRadius:10,padding:"14px 18px",marginBottom:10,border:"1.5px solid "+wc,display:"flex",alignItems:"baseline",justifyContent:"center",gap:2,minHeight:60}}>
        <span style={{fontSize:30,fontWeight:800,color:dirPart?C.accent:C.muted+"55",letterSpacing:1}}>{dirPart||"---"}</span>
        <span style={{fontSize:30,fontWeight:300,color:hasSep?C.muted:C.muted+"33"}}>/</span>
        <span style={{fontSize:30,fontWeight:800,color:spdPart?C.text:C.muted+"55",letterSpacing:1}}>{spdPart||"--"}</span>
        {(hasG||gustPart)&&<>
          <span style={{fontSize:24,fontWeight:800,color:C.gold,marginLeft:2}}>G</span>
          <span style={{fontSize:30,fontWeight:800,color:gustPart?C.red:C.muted+"55",letterSpacing:1}}>{gustPart||"--"}</span>
        </>}
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:10,fontSize:10,fontWeight:600}}>
        <span style={{color:C.accent}}>DIR °</span>
        <span style={{color:C.text}}>SPD kt</span>
        {(hasG||gustPart)&&<span style={{color:C.gold}}>GUST kt</span>}
      </div>
      {rows.map((row,ri)=>(
        <div key={ri} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
          {row.map(k=>(
            <button key={k} onClick={()=>wPress(k)}
              style={{padding:"16px 0",fontSize:k==="⌫"?19:k==="C"?16:22,fontWeight:700,
                background:k==="⌫"?"#1e3050":k==="C"?"#3a1010":"#0f1829",
                color:k==="C"?"#c0504a":"#dce6ee",border:"1.5px solid #1a2a3a",
                borderRadius:12,cursor:"pointer",lineHeight:1,
                WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <button onClick={()=>wPress("/")} disabled={wVal.includes("/")}
          style={{padding:"14px 0",fontSize:22,fontWeight:800,
            background:!wVal.includes("/")?C.accent+"22":"#0f1829",
            color:!wVal.includes("/")?C.accent:C.muted+"44",
            border:"1.5px solid "+(wVal.includes("/")?C.border:C.accent+"55"),
            borderRadius:12,cursor:wVal.includes("/")?"default":"pointer"}}>
          /
        </button>
        <button onClick={()=>wPress("G")} disabled={!wVal.includes("/")||wVal.includes("G")}
          style={{padding:"14px 0",fontSize:20,fontWeight:800,
            background:wVal.includes("/")&&!wVal.includes("G")?C.gold+"22":"#0f1829",
            color:wVal.includes("/")&&!wVal.includes("G")?C.gold:C.muted+"44",
            border:"1.5px solid "+(wVal.includes("/")&&!wVal.includes("G")?C.gold+"55":C.border),
            borderRadius:12,cursor:wVal.includes("/")&&!wVal.includes("G")?"pointer":"default",
            letterSpacing:1}}>
          G <span style={{fontSize:11,fontWeight:600,opacity:.7}}>GUST</span>
        </button>
      </div>
      <button onClick={()=>onDone(wVal)}
        style={{width:"100%",background:"linear-gradient(135deg,"+wc+","+wc+"bb)",
          border:"none",borderRadius:12,padding:"16px",color:"#fff",fontSize:17,fontWeight:800,
          cursor:"pointer",letterSpacing:.3}}>
        Done
      </button>
    </div>
  );
}

// ── BKE / Brake Cooling Calculator ───────────────────────────────────────
const BKE_MAX=142.3;
const BKE_NORMAL=103;
const BKE_CAUTION=121;
const BKE_TAXI_PER_MILE=2.5;
const BKE_SLOPE_PER_PCT_MILE=5.0;
const BTMS_PER_MFP=893/142.3; // ≈6.276 °C per MFP
// Cooling curve data points digitized from AFM chart [BKE(MFP), hours]
const COOL_CURVE=[[0,0],[8,0.5],[18,1.0],[31,1.5],[45,2.0],[56,2.35],[62,2.5],[75,2.75],[90,3.0],[100,3.1],[110,3.2],[121,3.3],[130,3.4],[142.3,3.6]];

function bkeCoolingTime(mfp){
  if(mfp<=0)return 0;
  if(mfp>=142.3)return 3.6;
  for(let i=0;i<COOL_CURVE.length-1;i++){
    if(mfp>=COOL_CURVE[i][0]&&mfp<=COOL_CURVE[i+1][0]){
      const t=(mfp-COOL_CURVE[i][0])/(COOL_CURVE[i+1][0]-COOL_CURVE[i][0]);
      return COOL_CURVE[i][1]+t*(COOL_CURVE[i+1][1]-COOL_CURVE[i][1]);
    }
  }
  return 3.6;
}

function casToGs(cas,altFt,oatC,windKts){
  // CAS→TAS→GS conversion
  const h=Math.min(altFt,36089);
  const delta=Math.pow(1-6.8756e-6*h,5.2559); // pressure ratio
  const tStd=288.15-1.981e-3*h; // std temp at alt (K)
  const tAct=oatC+273.15; // actual temp (K)
  const sigma=delta*(288.15/tAct); // density ratio
  const tas=cas/Math.sqrt(sigma);
  return tas+windKts; // +tailwind, -headwind
}

function calcBke(weightLbs,gsKts){
  const vFps=gsKts*1.68781; // knots to ft/s
  return(weightLbs*vFps*vFps)/(2*32.174*1e6);
}

function bkeZone(mfp){
  if(mfp>=BKE_CAUTION)return{zone:"DANGER",color:"#c0504a",icon:"🔴",actions:["Clear runway immediately — fuseplugs will blow 2-30 min after braking","Use idle reverse for all maneuvering","Evacuate airplane","Do NOT set parking brake","Do NOT approach main gear for 30 minutes","Teardown inspection required after cooling"]};
  if(mfp>=BKE_NORMAL)return{zone:"CAUTION",color:"#c09a4a",icon:"🟡",actions:["Move airplane from runway — tires could deflate","Use brakes sparingly, idle reverse to assist","Do NOT set parking brake — use chocks","Allow brakes to cool per cooling chart","Inspect wheels/brakes after cooling"]};
  return{zone:"NORMAL",color:"#5a8f7a",icon:"🟢",actions:["Delay subsequent activity for required cooling","Use chocks instead of parking brake when possible","Above 80 MFP: take care to avoid uneven braking","Use idle reverse thrust to assist taxi stops"]};
}

function BrakeCalc(){
  const wide=useWide();
  const[mode,setMode]=useState("landing"); // "landing" or "turnaround"
  const[weight,setWeight]=useState("75000");
  const[brakesOnSpd,setBrakesOnSpd]=useState("120");
  const[altFt,setAltFt]=useState("0");
  const[oatC,setOatC]=useState("15");
  const[windStr,setWindStr]=useState(""); // "280/5" or "280/5G17"
  const[rwyHdg,setRwyHdg]=useState("");
  const[windParsed,setWindParsed]=useState(null); // {dir,spd,gust}
  const[taxiDist,setTaxiDist]=useState("1");
  const[slopePct,setSlopePct]=useState("0");
  const[slopeMiles,setSlopeMiles]=useState("0");
  const[useBtms,setUseBtms]=useState(false);
  const[btmsTemp,setBtmsTemp]=useState("");
  // Turnaround fields
  const[toWeight,setToWeight]=useState("89000");
  const[toV1,setToV1]=useState("143");
  const[toTaxiDist,setToTaxiDist]=useState("2");
  const[toSlopePct,setToSlopePct]=useState("0");
  const[toSlopeMiles,setToSlopeMiles]=useState("0");
  // Results
  const[result,setResult]=useState(null);
  const[showPad,setShowPad]=useState(null);
  const[showWindPad,setShowWindPad]=useState(false);
  const[showExplain,setShowExplain]=useState(false);

  function parseWind(str){
    const s=str.replace(/\s+/g,"").toUpperCase();
    // Formats: "280/5", "280/5G17", "280/5 G17", "280/5G 17"
    const m=s.match(/^(\d{1,3})[\/\\](\d+)(?:G(\d+))?$/);
    if(m){setWindParsed({dir:Number(m[1]),spd:Number(m[2]),gust:m[3]?Number(m[3]):null});return;}
    setWindParsed(null);
  }
  function getWindComponent(){
    if(!windParsed||!rwyHdg)return 0;
    const spd=windParsed.gust||windParsed.spd; // use gust for worst case
    const diff=(windParsed.dir-Number(rwyHdg))*Math.PI/180;
    return-spd*Math.cos(diff); // negative=headwind, positive=tailwind
  }
  function getXwind(){
    if(!windParsed||!rwyHdg)return 0;
    const spd=windParsed.gust||windParsed.spd;
    return Math.abs(spd*Math.sin((windParsed.dir-Number(rwyHdg))*Math.PI/180));
  }

  function calculate(){
    setShowExplain(false);
    const w=Number(weight||75000);
    const alt=Number(altFt||0);
    const oat=Number(oatC||15);
    const wind=getWindComponent();
    const taxi=Number(taxiDist||0);
    const slope=Number(slopePct||0);
    const slopeM=Number(slopeMiles||0);

    let landBke;
    if(useBtms&&btmsTemp){
      landBke=Number(btmsTemp)/BTMS_PER_MFP;
    }else{
      const cas=Number(brakesOnSpd||120);
      const gs=casToGs(cas,alt,oat,wind);
      landBke=calcBke(w,gs);
    }
    const taxiBke=taxi*BKE_TAXI_PER_MILE+(slope>0?slope*BKE_SLOPE_PER_PCT_MILE*slopeM:0);
    const totalLanding=landBke+taxiBke;

    let r={landBke:Math.round(landBke*10)/10,taxiBke:Math.round(taxiBke*10)/10,
      totalLanding:Math.round(totalLanding*10)/10,btmsEst:Math.round(totalLanding*BTMS_PER_MFP),
      coolingFull:bkeCoolingTime(totalLanding),zone:bkeZone(totalLanding),mode};

    if(mode==="turnaround"){
      const tw=Number(toWeight||89000);
      const v1=Number(toV1||143)+2; // brakes-on = V1+2
      const tTaxi=Number(toTaxiDist||2);
      const tSlope=Number(toSlopePct||0);
      const tSlopeM=Number(toSlopeMiles||0);
      const toGs=casToGs(v1,alt,oat,wind);
      const toBke=calcBke(tw,toGs);
      const toTaxiBke=tTaxi*BKE_TAXI_PER_MILE+(tSlope>0?tSlope*BKE_SLOPE_PER_PCT_MILE*tSlopeM:0);
      const totalTo=toBke+toTaxiBke;
      const cumulative=totalLanding+totalTo;
      const excess=cumulative-BKE_MAX;
      let cooldownNeeded=0;
      if(excess>0){
        const initCool=bkeCoolingTime(totalLanding);
        const targetBke=totalLanding-excess;
        const finalCool=targetBke>0?bkeCoolingTime(targetBke):0;
        cooldownNeeded=Math.max(0,initCool-finalCool);
      }
      r={...r,toBke:Math.round(toBke*10)/10,toTaxiBke:Math.round(toTaxiBke*10)/10,
        totalTo:Math.round(totalTo*10)/10,cumulative:Math.round(cumulative*10)/10,
        excess:Math.round(Math.max(0,excess)*10)/10,cooldownNeeded:Math.round(cooldownNeeded*100)/100,
        cumulativeZone:bkeZone(cumulative),exceedsMax:excess>0};
    }
    setResult(r);
  }

  const padFields=[
    {k:"weight",v:weight,s:setWeight,l:"Gross Weight (lbs)",st:"100"},
    {k:"speed",v:brakesOnSpd,s:setBrakesOnSpd,l:"Brakes-On Speed (KCAS)",st:"1"},
    {k:"alt",v:altFt,s:setAltFt,l:"Pressure Altitude (ft)",st:"100"},
    {k:"oat",v:oatC,s:setOatC,l:"OAT (°C)",st:"1"},
    {k:"rwyHdg",v:rwyHdg,s:setRwyHdg,l:"Runway Heading (°)",st:"1"},
    {k:"taxi",v:taxiDist,s:setTaxiDist,l:"Taxi Distance (miles)",st:"any"},
    {k:"slope",v:slopePct,s:setSlopePct,l:"Downhill Slope (%)",st:"any"},
    {k:"slopeM",v:slopeMiles,s:setSlopeMiles,l:"Downhill Distance (miles)",st:"any"},
    {k:"btms",v:btmsTemp,s:setBtmsTemp,l:"BTMS Peak Temp (°C)",st:"1"},
    {k:"toWt",v:toWeight,s:setToWeight,l:"Takeoff Weight (lbs)",st:"100"},
    {k:"toV1",v:toV1,s:setToV1,l:"V1 Speed (KCAS)",st:"1"},
    {k:"toTaxi",v:toTaxiDist,s:setToTaxiDist,l:"Takeoff Taxi (miles)",st:"any"},
    {k:"toSlope",v:toSlopePct,s:setToSlopePct,l:"TO Downhill Slope (%)",st:"any"},
    {k:"toSlopeM",v:toSlopeMiles,s:setToSlopeMiles,l:"TO Downhill Dist (miles)",st:"any"},
  ];
  function pf(key){return padFields.find(f=>f.k===key);}
  function inp(key,color){
    const f=pf(key);if(!f)return null;
    return(<div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:color||C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{f.l}</div>
      <input readOnly value={f.v} onClick={()=>setShowPad(key)}
        style={{width:"100%",background:(color||C.sub)+"0d",border:"1.5px solid "+(color||C.sub)+"55",borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box",cursor:"pointer"}}/>
    </div>);
  }

  function fmtHrs(h){const hrs=Math.floor(h);const mins=Math.round((h-hrs)*60);return hrs+"h "+mins+"m";}

  return(<>
    {/* Mode toggle */}
    <div style={{display:"flex",gap:6,marginBottom:14}}>
      {[{m:"landing",l:"🛬 Landing / RTO"},{m:"turnaround",l:"🔄 Quick Turnaround"}].map(({m,l})=>(
        <button key={m} onClick={()=>{setMode(m);setResult(null);}}
          style={{flex:1,padding:"10px 6px",borderRadius:8,border:"1.5px solid "+(mode===m?C.accent:C.border),
            background:mode===m?C.accent+"22":C.card,color:mode===m?C.accent:C.muted,
            fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
      ))}
    </div>

    {/* BTMS toggle */}
    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:useBtms?10:0}}>
        <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8}}>Input Method</div>
        <div style={{display:"flex",gap:6}}>
          {[{v:false,l:"Speed"},{v:true,l:"BTMS Temp"}].map(({v,l})=>(
            <button key={l} onClick={()=>setUseBtms(v)}
              style={{padding:"6px 12px",borderRadius:7,border:"1.5px solid "+(useBtms===v?C.accent:C.border),
                background:useBtms===v?C.accent+"22":"transparent",color:useBtms===v?C.accent:C.muted,
                fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>
      {useBtms&&inp("btms",C.gold)}
    </div>

    {/* Landing inputs */}
    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Landing / Braking Event</div>
      {inp("weight",C.accent)}
      {!useBtms&&<>
        {inp("speed","#5a8f7a")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>{inp("alt",C.sub)}</div>
          <div>{inp("oat",C.sub)}</div>
        </div>
        {/* Wind */}
        <div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:10,border:"1px solid "+C.border}}>
          <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Wind & Runway</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:6}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Wind</div>
              <div onClick={()=>setShowWindPad(true)}
                style={{width:"100%",background:C.card,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",
                  color:windStr?C.text:C.muted,fontSize:16,fontWeight:700,boxSizing:"border-box",cursor:"pointer",
                  letterSpacing:1,fontFamily:"monospace",minHeight:44}}>
                {windStr||"280/5G17"}
              </div>
            </div>
            <div>{inp("rwyHdg","#5a8f7a")}</div>
          </div>
          {windParsed&&<div style={{fontSize:11,color:C.muted,marginBottom:windParsed&&rwyHdg?6:0}}>
            {windParsed.dir}° at {windParsed.spd} kt{windParsed.gust?" gusting "+windParsed.gust+" kt":""}
            {windParsed.gust&&<span style={{color:C.gold,fontWeight:700}}> · Using gust for BKE</span>}
          </div>}
          {windParsed&&rwyHdg&&(()=>{
            const comp=getWindComponent();const hw=comp<0;const xw=Math.round(getXwind());
            return(<div style={{display:"flex",gap:10}}>
              <div style={{flex:1,background:C.card,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Head/Tail</div>
                <div style={{fontSize:14,fontWeight:800,color:hw?C.green:C.red}}>{hw?"▼ ":"▲ "}{Math.abs(Math.round(comp))} kt {hw?"head":"tail"}</div>
              </div>
              <div style={{flex:1,background:C.card,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Crosswind</div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>{xw} kt</div>
              </div>
            </div>);
          })()}
        </div>
      </>}
      {inp("taxi",C.gold)}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>{inp("slope",C.muted)}</div>
        <div>{inp("slopeM",C.muted)}</div>
      </div>
    </div>

    {/* Turnaround inputs */}
    {mode==="turnaround"&&(
      <div style={{background:C.card,border:"1px solid "+C.accent+"44",borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Subsequent Takeoff (RTO)</div>
        {inp("toWt",C.accent)}
        {inp("toV1","#5a8f7a")}
        {inp("toTaxi",C.gold)}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>{inp("toSlope",C.muted)}</div>
          <div>{inp("toSlopeM",C.muted)}</div>
        </div>
      </div>
    )}

    <button onClick={calculate}
      style={{width:"100%",padding:14,borderRadius:10,border:"none",marginBottom:14,
        background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",color:"#fff",
        fontSize:16,fontWeight:800,cursor:"pointer",letterSpacing:.3}}>
      Calculate BKE
    </button>

    {/* Results */}
    {result&&(
      <div style={{marginBottom:14}}>
        {/* Zone banner */}
        <div style={{background:result.zone.color+"18",border:"2px solid "+result.zone.color+"55",borderRadius:12,padding:"16px 14px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:6}}>{result.zone.icon}</div>
          <div style={{fontSize:18,fontWeight:900,color:result.zone.color,letterSpacing:.5}}>{result.zone.zone} ZONE</div>
          <div style={{fontSize:22,fontWeight:900,color:C.text,marginTop:6}}>{result.totalLanding} MFP</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>
            Landing BKE: {result.landBke} + Taxi: {result.taxiBke} MFP
          </div>
        </div>

        {/* Detail table */}
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"8px 12px",background:C.panel,fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8}}>BKE Detail</div>
          {[
            {l:"Landing/RTO BKE",v:result.landBke+" MFP"},
            {l:"Taxi BKE",v:result.taxiBke+" MFP"},
            {l:"Total BKE",v:result.totalLanding+" MFP",highlight:true,color:result.zone.color},
            {l:"Est. BTMS Peak",v:result.btmsEst+"°C"+(result.btmsEst>=650?" ⚠️":""),color:result.btmsEst>=650?"#c09a4a":null},
            {l:"Max BKE Capacity",v:"142.3 MFP"},
            {l:"Remaining Capacity",v:Math.max(0,Math.round((BKE_MAX-result.totalLanding)*10)/10)+" MFP",color:result.totalLanding>BKE_MAX?C.red:C.green},
            {l:"Full Cooling Time",v:fmtHrs(result.coolingFull)},
          ].map((row,j)=>(
            <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderTop:"1px solid "+C.border,background:row.highlight?(row.color||C.text)+"0c":"transparent"}}>
              <span style={{fontSize:12,color:row.color||C.muted,fontWeight:row.highlight?700:400,flex:1}}>{row.l}</span>
              <span style={{fontSize:12,color:row.color||C.text,fontWeight:row.highlight?800:600,textAlign:"right",marginLeft:12}}>{row.v}</span>
            </div>
          ))}
        </div>

        {/* Turnaround results */}
        {mode==="turnaround"&&result.cumulative!=null&&(
          <div style={{background:result.exceedsMax?C.red+"12":C.green+"12",border:"1.5px solid "+(result.exceedsMax?C.red:C.green)+"44",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:result.exceedsMax?C.red:C.green,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
              Quick Turnaround Assessment
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[{l:"Landing Total",v:result.totalLanding+" MFP"},{l:"Takeoff RTO",v:result.totalTo+" MFP"},{l:"Cumulative",v:result.cumulative+" MFP",fw:800},{l:"Max Capacity",v:"142.3 MFP"}].map(({l,v,fw})=>(
                <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:fw||600,color:C.text,marginTop:2}}>{v}</div>
                </div>
              ))}
            </div>
            {result.exceedsMax?(
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:6}}>
                  ⚠️ Exceeds max by {result.excess} MFP — cooling required
                </div>
                <div style={{fontSize:20,fontWeight:900,color:C.text,marginBottom:4}}>
                  Minimum cooldown: {fmtHrs(result.cooldownNeeded)}
                </div>
                <div style={{fontSize:12,color:C.muted}}>
                  Wait at least {fmtHrs(result.cooldownNeeded)} after landing before takeoff.
                </div>
              </div>
            ):(
              <div style={{fontSize:14,fontWeight:700,color:C.green}}>
                ✅ Within capacity — no cooling delay required
              </div>
            )}
          </div>
        )}

        {/* Zone actions */}
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"8px 12px",background:result.zone.color+"15",fontSize:10,fontWeight:700,color:result.zone.color,textTransform:"uppercase",letterSpacing:.8}}>
            {result.zone.zone} Zone Procedures
          </div>
          {result.zone.actions.map((a,i)=>(
            <div key={i} style={{padding:"8px 12px",borderTop:"1px solid "+C.border,fontSize:12,color:C.text,lineHeight:1.6,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{color:result.zone.color,fontWeight:800,flexShrink:0}}>{i+1}.</span>{a}
            </div>
          ))}
        </div>

        {/* Explain button */}
        <button onClick={()=>setShowExplain(!showExplain)}
          style={{width:"100%",padding:"14px 16px",borderRadius:12,background:showExplain?C.accent+"15":C.card,
            border:"1.5px solid "+(showExplain?C.accent+"66":C.accent+"44"),color:C.accent,fontSize:14,fontWeight:700,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:18}}>💡</span> {showExplain?"Hide":"Explain in Plain English"}
          <span style={{fontSize:12,display:"inline-block",transition:"transform 0.2s",transform:showExplain?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
        </button>

        {showExplain&&(()=>{
          const lines=[];
          if(useBtms)lines.push({icon:"🌡️",text:`Using BTMS peak temperature of ${btmsTemp}°C, the estimated BKE is ${result.landBke} MFP.`});
          else{
            const wc=getWindComponent();const wcAbs=Math.abs(Math.round(wc));const wcType=wc<0?"headwind":"tailwind";
            const windNote=windParsed&&wcAbs>0?` With ${wcAbs} kt ${wcType} (${windParsed.dir}°/${windParsed.gust||windParsed.spd} kt${windParsed.gust?" gust":""}, runway ${rwyHdg}°), ground speed is adjusted accordingly.`:"";
            lines.push({icon:"🔢",text:`At ${Number(weight).toLocaleString()} lbs with brakes-on speed of ${brakesOnSpd} KCAS, the braking kinetic energy is ${result.landBke} MFP.${windNote}`});
          }
          if(result.taxiBke>0)lines.push({icon:"🚕",text:`Taxi adds ${result.taxiBke} MFP (${taxiDist} mi × 2.5 MFP/mi${Number(slopePct)>0?" + "+slopePct+"% slope correction":""}), bringing the total to ${result.totalLanding} MFP.`});
          lines.push({icon:result.zone.icon,text:`This puts the brakes in the ${result.zone.zone} zone. ${result.zone.zone==="NORMAL"?"Fuseplug release is not likely, but cooling time should be observed before subsequent operations.":result.zone.zone==="CAUTION"?"Fuseplug release is possible. Move the airplane clear and allow brakes to cool.":"Fuseplug release is probable within 2-30 minutes. Evacuate immediately."}`});
          lines.push({icon:"❄️",text:`Full cooling to restore 142.3 MFP capacity requires approximately ${fmtHrs(result.coolingFull)}.`});
          if(mode==="turnaround"&&result.cumulative!=null){
            lines.push({icon:"🔄",text:`A rejected takeoff at ${Number(toWeight).toLocaleString()} lbs / V1 ${toV1} kts would add ${result.totalTo} MFP, for a cumulative total of ${result.cumulative} MFP against the 142.3 MFP maximum.`});
            if(result.exceedsMax)lines.push({icon:"⏱️",text:`The cumulative energy exceeds capacity by ${result.excess} MFP. You must wait at least ${fmtHrs(result.cooldownNeeded)} after landing before attempting takeoff to dissipate the excess energy.`});
            else lines.push({icon:"✅",text:"The cumulative energy is within the 142.3 MFP maximum. No additional cooling delay is required before takeoff."});
          }
          return(<div style={{marginTop:12,borderRadius:14,overflow:"hidden",border:"1.5px solid "+C.accent+"33",background:C.card}}>
            <div style={{padding:"10px 14px",background:C.panel,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid "+C.border}}>
              <span style={{fontSize:16}}>💡</span>
              <div><div style={{fontSize:12,fontWeight:800,color:C.light}}>What This Means</div><div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>Plain English BKE breakdown</div></div>
            </div>
            <div style={{padding:"12px 14px"}}>
              {lines.map((line,i)=>(<div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderBottom:i<lines.length-1?"1px solid "+C.border:"none"}}>
                <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{line.icon}</span>
                <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>{line.text}</div>
              </div>))}
            </div>
            <div style={{padding:"10px 14px",borderTop:"1px solid "+C.border,fontSize:10,color:C.muted,textAlign:"center"}}>
              Per GV AFM Appendix C Rev 31 · For planning purposes only
            </div>
          </div>);
        })()}

        <button onClick={()=>{setResult(null);setShowExplain(false);}}
          style={{width:"100%",marginTop:12,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>
          ← New Calculation
        </button>
      </div>
    )}

    {/* NumPad overlay */}
    {showPad&&(()=>{const f=pf(showPad);if(!f)return null;return(
      <NumPadOverlay onClose={()=>setShowPad(null)}>
        <NumPad value={f.v} label={f.l} step={f.st}
          onChange={v=>{f.s(v);setShowPad(null);}}
          onClose={()=>setShowPad(null)}/>
      </NumPadOverlay>);})()}

    {/* Wind keyboard overlay */}
    {showWindPad&&<NumPadOverlay onClose={()=>setShowWindPad(false)}>
      <WindPad value={windStr} onClose={()=>setShowWindPad(false)}
        onDone={v=>{setWindStr(v);parseWind(v);setShowWindPad(false);}}/>
    </NumPadOverlay>}
  </>);
}

// ── 10/24 Trip Parser ────────────────────────────────────────────────────
// ── OCR-aware duty schedule parser ───────────────────────────────────────
function parseOcrDutyTrip(text){
  // Clean up common OCR artifacts
  let cleaned=text
    .replace(/[""]/g,'"').replace(/['']/g,"'") // normalize quotes
    .replace(/(\d):(\d)["']/g,'$1:$2') // fix 01:1" → 01:1
    .replace(/\|/g,'l'); // pipe → l
  const lines=cleaned.split(/\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length<2)return null;
  const legs=[];
  let curDate=null;
  const monthNames=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const monthRe=new RegExp("\\b("+monthNames.join("|")+")\\b","i");

  // Very flexible route match: time ICAO (separator) ICAO time
  // Separators: +, *, >, →, -, =, », ➜, or combos, even single chars OCR might produce
  // Times: HH:MM or HHMM (3-4 digits)
  function findRoute(line){
    // Strip junk prefixes (OCR artifacts like ", er", ", an", "on")
    const stripped=line.replace(/^[^0-9A-Z]*\s*/i,"");
    // Try pattern: TIME ICAO sep ICAO TIME
    const m=stripped.match(/(\d{1,2}:?\d{2})\s+([A-Z]{4})\s*[+*>→»=\-–—]+\s*([A-Z]{4})\s+(\d{1,2}:?\d{2})/);
    if(m)return{depRaw:m[1],origin:m[2],dest:m[3],arrRaw:m[4]};
    // Try looser: just ICAO sep ICAO anywhere in line, with times nearby
    const m2=stripped.match(/([A-Z]{4})\s*[+*>→»=\-–—]+\s*([A-Z]{4})/);
    if(m2){
      const times=stripped.match(/\b(\d{1,2}:?\d{2})\b/g);
      if(times&&times.length>=2)return{depRaw:times[0],origin:m2[1],dest:m2[2],arrRaw:times[1]};
    }
    return null;
  }

  function parseTime(raw){
    if(!raw)return{h:0,m:0};
    const s=raw.replace(/[^0-9:]/g,"");
    if(s.includes(":")){const p=s.split(":");return{h:Number(p[0]),m:Number(p[1]||0)};}
    // No colon: HHMM or HMM
    if(s.length>=4)return{h:Number(s.slice(0,-2)),m:Number(s.slice(-2))};
    if(s.length===3)return{h:Number(s[0]),m:Number(s.slice(1))};
    return{h:Number(s),m:0};
  }

  const flightTimeRe=/\((\d+):(\d{2})\)/;
  const dutyRe=/Duty:\s*(\d+):(\d{2})/i;
  const flightRe=/Flight:\s*(\d+):(\d{2})/i;
  const restRe=/Rest:\s*(\d+):(\d{2})/i;

  for(let i=0;i<lines.length;i++){
    // Check for date: look for month name + nearby day number
    const mMatch=lines[i].match(monthRe);
    if(mMatch){
      const month=mMatch[1].toUpperCase();
      // Find day number on same line or adjacent
      for(let dd=Math.max(0,i-1);dd<=Math.min(i+1,lines.length-1);dd++){
        const nums=lines[dd].replace(monthRe,"").match(/\b(\d{1,2})\b/g);
        if(nums){for(const n of nums){const nv=Number(n);if(nv>=1&&nv<=31){curDate={day:nv,month,year2:25};break;}}}
      }
    }

    // Try to find a route on this line
    const route=findRoute(lines[i]);
    if(!route)continue;
    const dep=parseTime(route.depRaw),arr=parseTime(route.arrRaw);
    let flightMins=null,hasRest=false,restMins=null;

    // Scan nearby lines for flight time, duty, rest
    for(let j=i-1;j<=Math.min(i+5,lines.length-1);j++){
      if(j<0||j===i)continue;
      // Don't cross into another route
      if(j>i&&findRoute(lines[j]))break;
      const ftm=lines[j].match(flightTimeRe);
      if(ftm&&!flightMins)flightMins=Number(ftm[1])*60+Number(ftm[2]);
      const frm=lines[j].match(flightRe);
      if(frm&&!flightMins)flightMins=Number(frm[1])*60+Number(frm[2]);
      const rrm=lines[j].match(restRe);
      if(rrm){hasRest=true;restMins=Number(rrm[1])*60+Number(rrm[2]);}
    }
    // Also check the line before this route for Rest (it belongs to the previous leg)
    // and the Duty/Flight/Rest line AFTER the flight time parens for this leg

    if(!flightMins){let ft=(arr.h*60+arr.m)-(dep.h*60+dep.m);if(ft<0)ft+=1440;flightMins=ft;}
    legs.push({origin:route.origin,dest:route.dest,depH:dep.h,depM:dep.m,arrH:arr.h,arrM:arr.m,
      flightMins,hasRest,restMins,date:curDate?{...curDate}:null});
  }

  // Assign Rest from Duty/Flight/Rest lines that appear AFTER legs
  // Rest line after a leg means that leg ends a duty period
  for(let i=0;i<lines.length;i++){
    const rrm=lines[i].match(restRe);
    if(!rrm)continue;
    // Find which leg this rest belongs to — it's the last leg found BEFORE this line
    let lastLegIdx=-1;
    for(let li=0;li<legs.length;li++){
      // Find the line index of this leg in the original text
      for(let j=0;j<lines.length;j++){
        if(j>=i)break;
        const route=findRoute(lines[j]);
        if(route&&route.origin===legs[li].origin&&route.dest===legs[li].dest)lastLegIdx=li;
      }
    }
    if(lastLegIdx>=0){legs[lastLegIdx].hasRest=true;legs[lastLegIdx].restMins=Number(rrm[1])*60+Number(rrm[2]);}
  }

  if(legs.length===0)return null;
  return{legs,needDate:!legs[0].date};
}

// Parser for ARINCDirect crew-schedule screenshots (single day, single column).
// Unlike the trip parsers, here the route and its two times sit on SEPARATE
// lines, and the times are LOCAL — they are converted to UTC via ICAO_TZ
// (departure uses the origin offset, arrival uses the destination offset) so
// they share the canonical timeline the rest of the duty math expects.
//   TRIP #10969
//   KFLL =» KMIA
//   0543L (3 0800L      ← dep 0543L, garbled status, arr 0800L
//   MK / WM / RC
function parseCrewScheduleOcr(text){
  const cleaned=text.replace(/[""]/g,'"').replace(/['']/g,"'").replace(/\|/g,"l");
  const lines=cleaned.split(/\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length<2)return null;
  const monthNames=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const monthRe=new RegExp("\\b("+monthNames.join("|")+")\\b","i");
  // ICAO sep ICAO — uppercase 4-letter codes joined by an OCR arrow/separator.
  // OCR mangles the arrow into many forms: =» <=» «= «=» = > → etc., so the
  // class accepts any run of guillemets/angle-brackets/arrows/dashes/etc.
  const routeRe=/\b([A-Z]{4})\b\s*[=»«<>→➜➝+*\-–—~]+\s*\b([A-Z]{4})\b/;
  const swapRe=/CREW\s*SWAP/i;

  // Garbled time → {h,m,min}. "0543"→05:43, "10450"→1045, "800"→0800.
  function toTime(tok){
    let s=tok.replace(/\D/g,"");
    if(s.length>=4)s=s.slice(0,4);        // strip trailing OCR junk: 5+ digits → first 4
    else if(s.length===3)s="0"+s;          // HMM → 0HMM
    else return null;
    const h=Number(s.slice(0,2)),m=Number(s.slice(2,4));
    if(!Number.isFinite(h)||!Number.isFinite(m)||h>23||m>59)return null;
    return{h,m,min:h*60+m};
  }
  // Known offset or undefined. Don't default to 0 here — a missing destination
  // offset paired with a known departure offset would otherwise wrap the flight
  // across midnight into an absurd duration.
  function knownOffset(icao){const o=ICAO_TZ[icao];return(o===undefined||o===null||isNaN(o))?undefined:Number(o);}
  const toUtc=(min,off)=>(((min-off*60)%1440)+1440)%1440;

  // Date: month name + a nearby day number (no year in this layout).
  let curDate=null;
  for(let i=0;i<lines.length&&!curDate;i++){
    const mm=lines[i].match(monthRe);
    if(!mm)continue;
    const month=mm[1].toUpperCase();
    for(let dd=i;dd<=Math.min(i+1,lines.length-1)&&!curDate;dd++){
      const nums=lines[dd].replace(monthRe,"").match(/\b\d{1,2}\b/g);
      if(nums)for(const n of nums){const nv=Number(n);if(nv>=1&&nv<=31){curDate={day:nv,month,year2:25};break;}}
    }
  }

  const legs=[];
  for(let i=0;i<lines.length;i++){
    // CREW SWAP closes the preceding leg's duty period (rest boundary).
    if(swapRe.test(lines[i])){if(legs.length)legs[legs.length-1].hasRest=true;continue;}
    const rm=lines[i].match(routeRe);
    if(!rm)continue;
    const origin=rm[1].toUpperCase(),dest=rm[2].toUpperCase();
    // The two times sit on a following line — look ahead a few lines until the
    // next route/swap, picking the first line carrying two digit groups.
    let dep=null,arr=null;
    for(let j=i+1;j<=Math.min(i+3,lines.length-1);j++){
      if(routeRe.test(lines[j])||swapRe.test(lines[j]))break;
      const toks=lines[j].match(/\d{3,6}/g);
      if(toks&&toks.length>=2){
        const t1=toTime(toks[0]),t2=toTime(toks[1]);
        if(t1&&t2){dep=t1;arr=t2;break;}
      }
    }
    if(!dep||!arr){
      // Route with no times line (e.g. "MTPP =» KMIA" followed directly by crew
      // initials). Still record the leg so the user can fill times in via Edit.
      legs.push({origin,dest,depH:null,depM:null,arrH:null,arrM:null,
        flightMins:null,hasRest:false,restMins:null,needsTimes:true,
        date:curDate?{...curDate}:null});
      continue;
    }
    // If one endpoint's offset is unknown, borrow the other's (common for short
    // domestic legs); if both unknown, treat the times as already canonical (0).
    const oOff=knownOffset(origin),dOff=knownOffset(dest);
    const depOff=oOff!==undefined?oOff:(dOff!==undefined?dOff:0);
    const arrOff=dOff!==undefined?dOff:(oOff!==undefined?oOff:0);
    const depMin=toUtc(dep.min,depOff),arrMin=toUtc(arr.min,arrOff);
    const flightMins=(((arrMin-depMin)%1440)+1440)%1440;
    legs.push({origin,dest,
      depH:Math.floor(depMin/60),depM:depMin%60,
      arrH:Math.floor(arrMin/60),arrM:arrMin%60,
      flightMins,hasRest:false,restMins:null,date:curDate?{...curDate}:null});
  }
  if(legs.length===0)return null;
  // No date header found anywhere → prompt the user for the start date.
  return{legs,needDate:!curDate};
}

function parseDutyTrip(text){
  const raw=text.split(/\n/).map(l=>l.trim());
  const lines=raw.filter(Boolean);
  if(lines.length<4)return null;

  const timeRe=/^(\d{1,2}):(\d{2})$/;
  const icaoRe=/^[A-Z]{4}$/;
  const flightTimeRe=/^\((\d+):(\d{2})\)$/;
  const dutyRe=/^Duty:\s*(\d+):(\d{2})$/i;
  const flightRe=/^Flight:\s*(\d+):(\d{2})$/i;
  const restRe=/^Rest:\s*(\d+):(\d{2})$/i;
  const monthRe=/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i;
  const dayRe=/^(\d{1,2})$/;
  const yearRe=/^(\d{2})$/;

  const legs=[];
  let i=0;
  let curDate=null;

  function tryParseDate(startIdx){
    let d=null,m=null,y=null;
    for(let scan=startIdx;scan<Math.min(startIdx+6,lines.length);scan++){
      const ln=lines[scan];
      if(dayRe.test(ln)&&!m&&Number(ln)<=31&&Number(ln)>=1)d=Number(ln);
      else if(monthRe.test(ln.toUpperCase()))m=ln.toUpperCase();
      else if(yearRe.test(ln)&&m&&d)y=Number(ln);
      else if(timeRe.test(ln))break;
    }
    if(d&&m&&y)return{day:d,month:m,year2:y};
    return null;
  }

  const preDate=tryParseDate(0);
  if(preDate)curDate=preDate;

  i=0;
  while(i<lines.length){
    const ln=lines[i];
    if(dayRe.test(ln)&&Number(ln)>=1&&Number(ln)<=31){
      const pd=tryParseDate(i);
      if(pd){curDate=pd;i++;continue;}
    }
    if(monthRe.test(ln.toUpperCase())){i++;continue;}
    if(yearRe.test(ln)&&i>0&&monthRe.test((lines[i-1]||"").toUpperCase())){i++;continue;}

    const depMatch=ln.match(timeRe);
    if(!depMatch){i++;continue;}
    const depH=Number(depMatch[1]),depM=Number(depMatch[2]);
    let origin=null,dest=null,arrH=null,arrM=null,flightMins=null,hasRest=false,restMins=null;
    let j=i+1;
    while(j<lines.length&&!icaoRe.test(lines[j])){
      const pd=tryParseDate(j);if(pd)curDate=pd;j++;
    }
    if(j<lines.length&&icaoRe.test(lines[j])){origin=lines[j];j++;}else{i++;continue;}
    while(j<lines.length&&!icaoRe.test(lines[j])&&!timeRe.test(lines[j])){j++;}
    if(j<lines.length&&icaoRe.test(lines[j])){dest=lines[j];j++;}else{i++;continue;}
    while(j<lines.length){
      const am=lines[j].match(timeRe);
      if(am){arrH=Number(am[1]);arrM=Number(am[2]);j++;break;}
      j++;
    }
    if(arrH===null){i++;continue;}
    let scanEnd=Math.min(j+10,lines.length);
    for(let k=j;k<scanEnd;k++){
      const ftm=lines[k].match(flightTimeRe);
      if(ftm)flightMins=Number(ftm[1])*60+Number(ftm[2]);
      const frm=lines[k].match(flightRe);
      if(frm&&!flightMins)flightMins=Number(frm[1])*60+Number(frm[2]);
      const rm=lines[k].match(restRe);
      if(rm){hasRest=true;restMins=Number(rm[1])*60+Number(rm[2]);}
      if(k>j+1&&timeRe.test(lines[k])&&!dutyRe.test(lines[k])&&!flightRe.test(lines[k])&&!restRe.test(lines[k]))break;
    }
    if(!flightMins){let ft=(arrH*60+arrM)-(depH*60+depM);if(ft<0)ft+=1440;flightMins=ft;}
    legs.push({origin,dest,depH,depM,arrH,arrM,flightMins,hasRest,restMins,date:curDate?{...curDate}:null});
    i=j;
  }
  const standardResult=legs.length>0?{legs,needDate:!legs[0].date}:null;

  // Count "ICAO arrow ICAO" route lines so we know how many legs to expect from
  // a single-column crew-schedule screenshot. (Standard ARINCDirect pastes spread
  // a route across multiple lines and won't match here → 0, which is fine.)
  const routeLineRe=/\b[A-Z]{4}\b\s*[=»«<>→➜➝+*\-–—~]+\s*\b[A-Z]{4}\b/g;
  const expectedRoutes=(text.match(routeLineRe)||[]).length;

  // If the standard parser already captured every route, trust it.
  if(standardResult&&expectedRoutes>0&&standardResult.legs.length>=expectedRoutes)
    return standardResult;

  // Otherwise run every parser and return whichever found the MOST legs. A parser
  // that matches only 1 of several legs must not win over one that finds them all.
  // Ties prefer the earlier (more authoritative) parser: standard → ocr → crew.
  const candidates=[standardResult,parseOcrDutyTrip(text),parseCrewScheduleOcr(text)].filter(Boolean);
  if(candidates.length===0)return null;
  let best=candidates[0];
  for(const c of candidates)if(c.legs.length>best.legs.length)best=c;
  return best;
}

function groupDutyPeriods(legs){
  // Auto-detect rest: if gap between arrival and next departure > 4 hrs, treat as rest
  for(let i=0;i<legs.length-1;i++){
    if(legs[i].arrEpoch&&legs[i+1].depEpoch){
      const gapHrs=(legs[i+1].depEpoch-legs[i].arrEpoch)/3600000;
      if(gapHrs>=4)legs[i].hasRest=true;
    }
  }
  const periods=[];let cur=[];
  for(let i=0;i<legs.length;i++){cur.push(legs[i]);if(legs[i].hasRest||i===legs.length-1){periods.push({legs:[...cur]});cur=[];}}
  return periods;
}
function dateToEpoch(date,h,m){if(!date)return 0;return new Date(2000+date.year2,MONTHS[date.month]??0,date.day,h,m,0).getTime();}
function resolveLegTimes(legs){
  const resolved=[];let prevArrEpoch=null;
  for(let i=0;i<legs.length;i++){
    const leg=legs[i];let depEpoch;
    if(leg.date){depEpoch=dateToEpoch(leg.date,leg.depH,leg.depM);}
    else if(prevArrEpoch){const d=new Date(prevArrEpoch);depEpoch=new Date(d.getFullYear(),d.getMonth(),d.getDate(),leg.depH,leg.depM).getTime();if(depEpoch<prevArrEpoch)depEpoch+=86400000;}
    else{depEpoch=dateToEpoch({day:1,month:"JAN",year2:25},leg.depH,leg.depM);}
    const arrEpoch=depEpoch+leg.flightMins*60000;
    resolved.push({...leg,depEpoch,arrEpoch});prevArrEpoch=arrEpoch;
  }
  return resolved;
}
function fmtEpochT(ms,z){const d=new Date(ms);const hh=String(d.getHours()).padStart(2,"0");const mm=String(d.getMinutes()).padStart(2,"0");const mon=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];return`${d.getDate()} ${mon} ${hh}:${mm}${z?"Z":"L"}`;}
function fmtHM(mins){const h=Math.floor(mins/60);const m=Math.round(mins%60);return`${h}:${String(m).padStart(2,"0")}`;}
function fmtHrs2(hrs){const h=Math.floor(hrs);const m=Math.round((hrs-h)*60);return`${h}:${String(m).padStart(2,"0")}`;}

function computeDutyAnalysis(periods,crewMode,dutyOnDefMin,dutyOffDefMin,customOffsets,crewOverrides){
  crewOverrides=crewOverrides||{};
  // Each duty period uses its own crew config (override) or the global default.
  const crewModeFor=pi=>crewOverrides[pi]||crewMode;
  const limitsFor=pi=>CREW_LIMITS[crewModeFor(pi)]||CREW_LIMITS[2];
  const limits=CREW_LIMITS[crewMode]||CREW_LIMITS[2]; // global default, kept for summary displays
  const violations=[];const dutyResults=[];let totalFlight=0,totalDuty=0,totalRest=0;const allLegs=[];
  periods.forEach((period,pi)=>{
    const pLimits=limitsFor(pi);
    const onOff=customOffsets[pi]||{on:dutyOnDefMin,off:dutyOffDefMin};
    const pLegs=period.legs;
    const firstDep=pLegs[0].depEpoch,lastArr=pLegs[pLegs.length-1].arrEpoch;
    const dutyStart=firstDep-onOff.on*60000,dutyEnd=lastArr+onOff.off*60000;
    const dutyHrs=(dutyEnd-dutyStart)/3600000;
    const flightHrs=pLegs.reduce((s,l)=>s+l.flightMins/60,0);
    const dutyPct=dutyHrs/pLimits.duty,flightPct=flightHrs/pLimits.flight;
    const dutyStatus=dutyPct>1?"red":dutyPct>=0.8?"amber":"green";
    const flightStatus=flightPct>1?"red":flightPct>=0.8?"amber":"green";
    if(dutyHrs>pLimits.duty)violations.push({period:pi,type:"duty",msg:`Duty period ${pi+1} is ${dutyHrs.toFixed(1)} hrs — exceeds ${pLimits.duty} hr max for ${pLimits.label}.`});
    if(flightHrs>pLimits.flight)violations.push({period:pi,type:"flight",msg:`Flight time in duty period ${pi+1} is ${flightHrs.toFixed(1)} hrs — exceeds ${pLimits.flight} hr max for ${pLimits.label}.`});
    totalFlight+=flightHrs;totalDuty+=dutyHrs;
    pLegs.forEach(l=>allLegs.push({...l,periodIdx:pi}));
    dutyResults.push({periodIdx:pi,legs:pLegs,dutyStart,dutyEnd,dutyHrs,flightHrs,dutyStatus,flightStatus,onMin:onOff.on,offMin:onOff.off,crewMode:crewModeFor(pi),limits:pLimits});
  });
  for(let i=1;i<dutyResults.length;i++){
    const restHrs=(dutyResults[i].dutyStart-dutyResults[i-1].dutyEnd)/3600000;
    // Rest BEFORE a duty period must satisfy the UPCOMING (this) period's crew config.
    const rLimits=limitsFor(i);
    dutyResults[i].restBefore=restHrs;dutyResults[i].restLimit=rLimits.rest;totalRest+=restHrs;
    if(restHrs<rLimits.rest)violations.push({period:i,type:"rest",msg:`Rest before duty period ${i+1} is ${restHrs.toFixed(1)} hrs — minimum ${rLimits.rest} hrs required for ${rLimits.label}.`});
  }
  // Rolling 24-hour check — limit comes from the CURRENT duty period's crew config,
  // but ALL flight time in the prior 24 hrs counts regardless of which crew flew it.
  for(let li=0;li<allLegs.length;li++){
    const leg=allLegs[li];
    const r24Limit=limitsFor(leg.periodIdx).rolling24;
    const checkPoints=[];
    for(let t=leg.depEpoch;t<=leg.arrEpoch;t+=1800000)checkPoints.push(t);
    if(!checkPoints.includes(leg.arrEpoch))checkPoints.push(leg.arrEpoch);
    for(const t of checkPoints){
      const w24=t-86400000;let flt=0;const contribs=[];
      for(const ol of allLegs){
        const os=Math.max(ol.depEpoch,w24),oe=Math.min(ol.arrEpoch,t);
        if(oe>os){const hrs=(oe-os)/3600000;flt+=hrs;contribs.push({origin:ol.origin,dest:ol.dest,hrs});}
      }
      if(flt>r24Limit){
        const exists=violations.find(v=>v.type==="rolling24"&&v.legIdx===li&&Math.abs((v.time||0)-t)<1800000);
        if(!exists)violations.push({period:leg.periodIdx,type:"rolling24",legIdx:li,time:t,total:flt,leg,contributors:contribs,
          msg:`Rolling 24-hr limit exceeded at ${fmtEpochT(t)}: ${flt.toFixed(1)} hrs flight (max ${r24Limit}).`});
      }
    }
  }
  return{dutyResults,violations,totalFlight,totalDuty,totalRest,allLegs,limits};
}

// ── FlightDutyCalc Component ─────────────────────────────────────────────
function FlightDutyCalc(){
  const wide=useWide();
  const[crewMode,setCrewMode]=useState(2);
  const[crewOverrides,setCrewOverrides]=useState({}); // { [dpIndex]: crewMode } — per-duty-period crew config
  const[dutyInputMode,setDutyInputMode]=useState("import"); // "import" or "manual"
  const[manualLegs,setManualLegs]=useState([{origin:"",dest:"",depTime:"",arrTime:"",depInput:"",arrInput:"",date:"",mode:"Z",crewMode:2}]);
  const[pasteText,setPasteText]=useState("");
  const[parseError,setParseError]=useState("");
  const[parsed,setParsed]=useState(null);
  const[needDate,setNeedDate]=useState(false);
  const[startDay,setStartDay]=useState("");
  const[startMonth,setStartMonth]=useState("APR");
  const[startYear,setStartYear]=useState("26");
  const[dutyOnDef,setDutyOnDef]=useState("60");
  const[dutyOffDef,setDutyOffDef]=useState("30");
  const[customOffsets,setCustomOffsets]=useState({});
  const[result,setResult]=useState(null);
  const[showExplain,setShowExplain]=useState(false);
  const[timeMode,setTimeMode]=useState("local");
  const[unknownIcaos,setUnknownIcaos]=useState({});
  const[sessionTz,setSessionTz]=useState({});
  const[importing,setImporting]=useState(false);
  const[importMsg,setImportMsg]=useState("");
  const imgRef=useRef();
  const camRef=useRef();
  const pdfRef=useRef();
  const importingRef=useRef(false);
  const[pdfReady,setPdfReady]=useState(false);

  // Load pdf.js from CDN
  useEffect(()=>{
    if(window.pdfjsLib){setPdfReady(true);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{
      if(window.pdfjsLib){
        window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        setPdfReady(true);
      }
    };
    document.head.appendChild(s);
  },[]);

  // Load Tesseract.js for local OCR
  const[ocrReady,setOcrReady]=useState(false);
  const[ocrBusy,setOcrBusy]=useState(false);
  useEffect(()=>{loadTesseract(ok=>setOcrReady(ok));},[]);

  async function ocrReadImage(dataUrl){
    setOcrBusy(true);
    try{const text=await ocrFromDataUrl(dataUrl,msg=>setImportMsg(msg));return text;}
    finally{setOcrBusy(false);}
  }

  async function handleOcrRead(){
    if(!pastedImg)return;
    setImporting(true);setParseError("");
    try{
      const text=await ocrReadImage(pastedImg);
      if(!text||!text.trim()){setImportMsg("❌ OCR found no text");setImporting(false);return;}
      setImportMsg("Parsing trip data...");
      const p=parseDutyTrip(text);
      if(p&&p.legs&&p.legs.length>0){
        setParsed(p);setNeedDate(p.needDate);setPasteText(text);setPastedImg(null);
        const unknown={};
        p.legs.forEach(l=>{
          if(l.origin&&!(l.origin in ICAO_TZ)&&!(l.origin in sessionTz))unknown[l.origin]=0;
          if(l.dest&&!(l.dest in ICAO_TZ)&&!(l.dest in sessionTz))unknown[l.dest]=0;
        });
        setUnknownIcaos(Object.keys(unknown).length>0?unknown:{});
        setImportMsg("✅ "+p.legs.length+" legs read from screenshot");
        setTimeout(()=>setImportMsg(""),4000);
      }else{
        // Couldn't auto-parse — dump OCR text into textarea for manual review
        setPasteText(text);setPastedImg(null);
        setImportMsg("📋 Text extracted — review in field above and hit Parse");
      }
    }catch(err){
      setImportMsg("❌ OCR error: "+err.message.slice(0,60));
      setTimeout(()=>setImportMsg(""),8000);
    }
    setImporting(false);setOcrBusy(false);
  }

  const limits=CREW_LIMITS[crewMode]||CREW_LIMITS[2];

  async function handlePdfImport(e){
    const file=e.target.files[0];if(!file)return;
    e.target.value="";
    if(importingRef.current)return;
    importingRef.current=true;setImporting(true);setParseError("");
    try{
      setImportMsg("Reading PDF...");
      const buf=await file.arrayBuffer();
      const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
      let allText="";
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);
        const content=await page.getTextContent();
        // Reconstruct lines by grouping text items by Y position
        const items=content.items.filter(it=>it.str.trim());
        if(items.length===0)continue;
        // Sort by Y (descending = top first) then X
        items.sort((a,b)=>{
          const dy=b.transform[5]-a.transform[5];
          if(Math.abs(dy)>3)return dy;
          return a.transform[4]-b.transform[4];
        });
        let lastY=null;
        for(const item of items){
          const y=Math.round(item.transform[5]);
          if(lastY!==null&&Math.abs(y-lastY)>3)allText+="\n";
          else if(lastY!==null)allText+=" ";
          allText+=item.str;
          lastY=y;
        }
        allText+="\n";
      }
      if(!allText.trim()){
        setImportMsg("❌ No text found in PDF");
        importingRef.current=false;setImporting(false);return;
      }
      setImportMsg("Parsing trip data...");
      // Try to parse the extracted text
      const p=parseDutyTrip(allText);
      if(p&&p.legs&&p.legs.length>0){
        setParsed(p);setNeedDate(p.needDate);setPasteText(allText);
        const unknown={};
        p.legs.forEach(l=>{
          if(l.origin&&!(l.origin in ICAO_TZ)&&!(l.origin in sessionTz))unknown[l.origin]=0;
          if(l.dest&&!(l.dest in ICAO_TZ)&&!(l.dest in sessionTz))unknown[l.dest]=0;
        });
        setUnknownIcaos(Object.keys(unknown).length>0?unknown:{});
        setImportMsg("✅ "+p.legs.length+" legs extracted from PDF");
        setTimeout(()=>setImportMsg(""),4000);
      }else{
        // Couldn't auto-parse, but put the text in the textarea for manual editing
        setPasteText(allText);
        setImportMsg("📋 Text extracted — review and hit Parse Trip");
        setTimeout(()=>setImportMsg(""),6000);
      }
    }catch(err){
      setImportMsg("❌ PDF error: "+err.message.slice(0,60));
      setTimeout(()=>setImportMsg(""),8000);
    }
    importingRef.current=false;setImporting(false);
  }

  async function processImageFile(file){
    if(!file||importingRef.current)return;
    importingRef.current=true;setImporting(true);setParseError("");
    try{
      // Convert file to dataURL
      setImportMsg("Preparing image...");
      const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error("Cannot read file"));r.readAsDataURL(file);});
      // Run OCR
      const text=await ocrReadImage(dataUrl);
      if(!text||!text.trim()){
        setImportMsg("❌ OCR found no text in image");
        setTimeout(()=>setImportMsg(""),6000);
        importingRef.current=false;setImporting(false);return;
      }
      setImportMsg("Parsing trip data...");
      const p=parseDutyTrip(text);
      if(p&&p.legs&&p.legs.length>0){
        setParsed(p);setNeedDate(p.needDate);setPasteText(text);
        const unknown={};
        p.legs.forEach(l=>{
          if(l.origin&&!(l.origin in ICAO_TZ)&&!(l.origin in sessionTz))unknown[l.origin]=0;
          if(l.dest&&!(l.dest in ICAO_TZ)&&!(l.dest in sessionTz))unknown[l.dest]=0;
        });
        setUnknownIcaos(Object.keys(unknown).length>0?unknown:{});
        setImportMsg("✅ "+p.legs.length+" legs read from image");
        setTimeout(()=>setImportMsg(""),4000);
      }else{
        // Couldn't auto-parse — put OCR text in textarea for manual review
        setPasteText(text);
        setImportMsg("📋 Text extracted — review in field above and hit Parse");
      }
    }catch(err){
      setImportMsg("❌ "+err.message.slice(0,60));
      setTimeout(()=>setImportMsg(""),8000);
    }
    importingRef.current=false;setImporting(false);setOcrBusy(false);
  }

  function handleImageImport(e){
    const file=e.target.files[0];if(!file)return;
    e.target.value="";processImageFile(file);
  }

  const[pastedImg,setPastedImg]=useState(null);
  const pasteBoxRef=useRef();

  // Handle paste into the contentEditable paste box
  function handlePasteFromBox(e){
    const items=e.clipboardData?.items;
    if(items){
      for(let i=0;i<items.length;i++){
        if(items[i].type.indexOf("image")!==-1){
          e.preventDefault();
          const file=items[i].getAsFile();
          if(!file)continue;
          const reader=new FileReader();
          reader.onload=ev=>{setPastedImg(ev.target.result);setImportMsg("");};
          reader.readAsDataURL(file);
          setTimeout(()=>{if(pasteBoxRef.current)pasteBoxRef.current.innerHTML="";},50);
          return;
        }
      }
    }
    // iOS Safari fallback: image may be inserted as <img> in DOM
    // Check after a short delay
    setTimeout(()=>{
      if(!pasteBoxRef.current)return;
      const imgs=pasteBoxRef.current.querySelectorAll("img");
      if(imgs.length>0){
        const src=imgs[0].src;
        if(src&&src.startsWith("blob:")){
          // Convert blob URL to data URL
          fetch(src).then(r=>r.blob()).then(blob=>{
            const reader=new FileReader();
            reader.onload=ev=>{setPastedImg(ev.target.result);setImportMsg("");};
            reader.readAsDataURL(blob);
          }).catch(()=>{});
        }else if(src&&src.startsWith("data:")){
          setPastedImg(src);setImportMsg("");
        }
        pasteBoxRef.current.innerHTML="";
        return;
      }
      // Text paste — put it in the textarea
      const text=pasteBoxRef.current.innerText||pasteBoxRef.current.textContent||"";
      if(text.trim()){
        setPasteText(prev=>(prev?prev+"\n":"")+text.trim());
        setImportMsg("✅ Text pasted into field above");
        setTimeout(()=>setImportMsg(""),3000);
      }
      pasteBoxRef.current.innerHTML="";
    },150);
  }

  function handleParse(){
    setResult(null);setShowExplain(false);setParseError("");
    if(!pasteText.trim()){setParseError("Paste your trip schedule above.");return;}
    const p=parseDutyTrip(pasteText);
    if(!p||!p.legs||p.legs.length===0){setParseError("No legs found. Check the format — paste from ARINCDirect.");return;}
    setParsed(p);setNeedDate(p.needDate);
    const unknown={};
    p.legs.forEach(l=>{
      if(l.origin&&!(l.origin in ICAO_TZ)&&!(l.origin in sessionTz))unknown[l.origin]=0;
      if(l.dest&&!(l.dest in ICAO_TZ)&&!(l.dest in sessionTz))unknown[l.dest]=0;
    });
    setUnknownIcaos(Object.keys(unknown).length>0?unknown:{});
  }

  function addManualLeg(){setManualLegs(ls=>[...ls,{origin:ls[ls.length-1]?.dest||"",dest:"",depTime:"",arrTime:"",depInput:"",arrInput:"",date:ls[ls.length-1]?.date||"",mode:ls[ls.length-1]?.mode||"Z",crewMode:ls[ls.length-1]?.crewMode||crewMode}]);}
  function removeManualLeg(i){setManualLegs(ls=>ls.length<=1?ls:ls.filter((_,j)=>j!==i));}

  // Look up an airport's UTC offset from ICAO_TZ (or sessionTz override).
  // Returns null when the ICAO is unknown so callers can branch cleanly.
  function tzOffsetFor(icao){
    if(!icao)return null;
    if(icao in ICAO_TZ)return ICAO_TZ[icao];
    const s=sessionTz[icao];
    if(s===undefined||s===""||isNaN(s))return null;
    return Number(s);
  }
  // Normalize HH:MM input. "0800" → "08:00", strips non-digit/colon, caps 5.
  // Partial input stays partial (so backspace + retype works).
  function normalizeHHMM(raw){
    let v=(raw||"").replace(/[^0-9:]/g,"");
    if(v.length===4&&!v.includes(":"))v=v.slice(0,2)+":"+v.slice(2);
    return v.slice(0,5);
  }
  function hhmmToMin(s){
    if(!s||s.length!==5||s[2]!==":")return null;
    const h=Number(s.slice(0,2)),m=Number(s.slice(3,5));
    if(!Number.isFinite(h)||!Number.isFinite(m))return null;
    return h*60+m;
  }
  function minToHHMM(total){
    const t=((total%1440)+1440)%1440;
    const h=Math.floor(t/60),m=t%60;
    return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  // Convert between displayed-local and canonical-UTC HH:MM strings.
  // Unknown ICAO offset is treated as +0 (per spec). Returns "" on partial input.
  function localFromUtc(zulu,off){const m=hhmmToMin(zulu);return m===null?"":minToHHMM(m+(off||0)*60);}
  function utcFromLocal(local,off){const m=hhmmToMin(local);return m===null?"":minToHHMM(m-(off||0)*60);}

  function updateManualLeg(i,field,val){
    setManualLegs(ls=>ls.map((l,j)=>{
      if(j!==i)return l;
      const next={...l,[field]:val};
      // Mode L pins the canonical UTC moment — switching ICAOs re-derives the
      // displayed local time so the underlying depTime/arrTime stay constant.
      if(next.mode==="L"&&field==="origin"){
        next.depInput=next.depTime?localFromUtc(next.depTime,tzOffsetFor(val)||0):"";
      }
      if(next.mode==="L"&&field==="dest"){
        next.arrInput=next.arrTime?localFromUtc(next.arrTime,tzOffsetFor(val)||0):"";
      }
      return next;
    }));
  }
  // Switch a leg's Z/L mode. The canonical UTC (depTime/arrTime) is preserved;
  // only the input buffer changes to show the same moment in the new mode.
  function setManualLegMode(i,mode){
    setManualLegs(ls=>ls.map((l,j)=>{
      if(j!==i)return l;
      const next={...l,mode};
      if(mode==="Z"){next.depInput=next.depTime||"";next.arrInput=next.arrTime||"";}
      else{
        next.depInput=next.depTime?localFromUtc(next.depTime,tzOffsetFor(next.origin)||0):"";
        next.arrInput=next.arrTime?localFromUtc(next.arrTime,tzOffsetFor(next.dest)||0):"";
      }
      return next;
    }));
  }
  // Single-field time setter. The input buffer (depInput/arrInput) always
  // mirrors what the user sees. The canonical UTC value (depTime/arrTime) is
  // recomputed when the input is complete (5 chars) and cleared on partial.
  function setManualLegTime(i,side,raw){
    const v=normalizeHHMM(raw);
    setManualLegs(ls=>ls.map((l,j)=>{
      if(j!==i)return l;
      const next={...l};
      const inKey=side==="dep"?"depInput":"arrInput";
      const utcKey=side==="dep"?"depTime":"arrTime";
      next[inKey]=v;
      const mins=hhmmToMin(v);
      if(mins===null){next[utcKey]="";return next;}
      if(next.mode==="Z"){next[utcKey]=v;}
      else{
        const off=tzOffsetFor(side==="dep"?next.origin:next.dest)||0;
        next[utcKey]=utcFromLocal(v,off);
      }
      return next;
    }));
  }

  function parseManualLegs(){
    const legs=[];
    for(let i=0;i<manualLegs.length;i++){
      const ml=manualLegs[i];
      if(!ml.origin||!ml.dest||!ml.depTime||!ml.arrTime){setParseError("Fill in all fields for leg "+(i+1));return;}
      const depParts=ml.depTime.split(":"),arrParts=ml.arrTime.split(":");
      if(depParts.length<2||arrParts.length<2){setParseError("Use HH:MM format for times on leg "+(i+1));return;}
      const depH=Number(depParts[0]),depM=Number(depParts[1]);
      const arrH=Number(arrParts[0]),arrM=Number(arrParts[1]);
      let flightMins=(arrH*60+arrM)-(depH*60+depM);if(flightMins<0)flightMins+=1440;
      let date=null;
      if(ml.date){
        const dp=ml.date.split("-");
        if(dp.length===3){
          const monthNames=["","JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          date={day:Number(dp[2]),month:monthNames[Number(dp[1])],year2:Number(dp[0].slice(-2))};
        }
      }
      legs.push({origin:ml.origin.toUpperCase(),dest:ml.dest.toUpperCase(),depH,depM,arrH,arrM,flightMins,hasRest:false,restMins:null,date,crewMode:ml.crewMode||crewMode,isLocal:ml.mode==="L"});
    }
    if(legs.length===0)return;
    setParseError("");
    const unknown={};
    legs.forEach(l=>{
      if(l.origin&&!(l.origin in ICAO_TZ)&&!(l.origin in sessionTz))unknown[l.origin]=0;
      if(l.dest&&!(l.dest in ICAO_TZ)&&!(l.dest in sessionTz))unknown[l.dest]=0;
    });
    setUnknownIcaos(Object.keys(unknown).length>0?unknown:{});
    setParsed({legs,needDate:!legs[0].date});
    setNeedDate(!legs[0].date);
  }

  function runCalc(){
    if(!parsed)return;
    let legs=[...parsed.legs];
    const missing=legs.findIndex(l=>l.needsTimes||l.depH===null||l.depH===undefined||l.arrH===null||l.arrH===undefined);
    if(missing>=0){setParseError("Leg "+(missing+1)+" is missing times — tap Edit to enter them.");return;}
    if(needDate&&startDay)legs[0]={...legs[0],date:{day:Number(startDay),month:startMonth,year2:Number(startYear)}};
    if(!legs[0].date){setParseError("Enter the start date for leg 1.");return;}
    const resolved=resolveLegTimes(legs);
    const periods=groupDutyPeriods(resolved);
    // Manual entry sets a per-leg crewMode; the first leg of each duty period
    // defines that period's crew config. Import legs have no crewMode → fall back
    // to the global default via crewOverrides.
    const derivedOverrides={...crewOverrides};
    periods.forEach((p,pi)=>{if(p.legs[0]&&p.legs[0].crewMode)derivedOverrides[pi]=p.legs[0].crewMode;});
    setCrewOverrides(derivedOverrides);
    const analysis=computeDutyAnalysis(periods,crewMode,Number(dutyOnDef)||0,Number(dutyOffDef)||0,customOffsets,derivedOverrides);
    setResult(analysis);
  }

  // Recompute analysis in place (used when a per-duty-period crew config or the
  // global "set all" selector changes while results are showing). gMode overrides
  // the global crewMode so we don't read stale state after setCrewMode.
  function recomputeWith(overrides,gMode){
    if(!parsed)return;
    let legs=[...parsed.legs];
    if(needDate&&startDay)legs[0]={...legs[0],date:{day:Number(startDay),month:startMonth,year2:Number(startYear)}};
    if(!legs[0].date)return;
    const resolved=resolveLegTimes(legs);
    const periods=groupDutyPeriods(resolved);
    const analysis=computeDutyAnalysis(periods,gMode??crewMode,Number(dutyOnDef)||0,Number(dutyOffDef)||0,customOffsets,overrides);
    setResult(analysis);
  }

  function handleOffsetChange(pi,field,val){setCustomOffsets(prev=>({...prev,[pi]:{...(prev[pi]||{on:Number(dutyOnDef)||0,off:Number(dutyOffDef)||0}),[field]:Number(val)}}));}
  function statusColor(s){return s==="red"?C.red:s==="amber"?C.gold:C.green;}
  function statusLabel(s){return s==="red"?"EXCEEDED":s==="amber"?"CAUTION":"OK";}
  function resetAll(){setParsed(null);setResult(null);setPasteText("");setParseError("");setNeedDate(false);setCustomOffsets({});setCrewOverrides({});setShowExplain(false);setUnknownIcaos({});setImportMsg("");setPastedImg(null);}

  function editLegs(){
    if(!parsed)return;
    const monthNames=["","JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const mLegs=parsed.legs.map(l=>{
      const depT=l.depH===null||l.depH===undefined?"":String(l.depH).padStart(2,"0")+":"+String(l.depM).padStart(2,"0");
      const arrT=l.arrH===null||l.arrH===undefined?"":String(l.arrH).padStart(2,"0")+":"+String(l.arrM).padStart(2,"0");
      let dateStr="";
      if(l.date){
        const mi=monthNames.indexOf(l.date.month);
        if(mi>0)dateStr="20"+String(l.date.year2).padStart(2,"0")+"-"+String(mi).padStart(2,"0")+"-"+String(l.date.day).padStart(2,"0");
      }
      // Parsed times are canonical UTC. Restore the leg's original Z/L mode if it
      // was manually entered (l.isLocal); OCR/paste legs default to Z. In L mode the
      // visible buffers (depInput/arrInput) must show local time, derived from UTC.
      const isLocal=l.isLocal===true;
      const mode=isLocal?"L":"Z";
      const depInput=isLocal?localFromUtc(depT,tzOffsetFor(l.origin)||0):depT;
      const arrInput=isLocal?localFromUtc(arrT,tzOffsetFor(l.dest)||0):arrT;
      return{origin:l.origin||"",dest:l.dest||"",depTime:depT,arrTime:arrT,depInput,arrInput,date:dateStr,mode,crewMode:l.crewMode||crewMode};
    });
    setManualLegs(mLegs);
    setDutyInputMode("manual");
    setParsed(null);
    setResult(null);
    setParseError("");
    setShowExplain(false);
  }

  return(<>
    <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp,image/*" style={{display:"none"}} onChange={handleImageImport}/>
    <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleImageImport}/>
    <input ref={pdfRef} type="file" accept=".pdf,application/pdf" style={{display:"none"}} onChange={handlePdfImport}/>

    {/* ── MODE TOGGLE ── */}
    {!result&&!parsed&&<div style={{display:"flex",gap:0,background:C.bg,borderRadius:10,padding:3,border:"1px solid "+C.border,marginBottom:14}}>
      {[{m:"import",l:"📋 Import"},{m:"manual",l:"✏️ Manual"}].map(({m,l})=>(
        <button key={m} onClick={()=>{setDutyInputMode(m);setParseError("");}}
          style={{flex:1,padding:"10px 8px",borderRadius:8,border:"none",background:dutyInputMode===m?C.accent:"transparent",color:dutyInputMode===m?"#fff":C.muted,fontSize:13,fontWeight:700,cursor:"pointer"}}>{l}</button>
      ))}
    </div>}

    {/* ── MANUAL ENTRY ── */}
    {!result&&!parsed&&dutyInputMode==="manual"&&<div style={{background:C.card,border:"1.5px solid "+C.accent+"55",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>✏️ Enter Legs</div>
      {manualLegs.map((ml,i)=>{
        const lc=dutyLegColor(i);
        const mode=ml.mode||"Z",isL=mode==="L";
        const legCrew=ml.crewMode||crewMode;
        // Live flight time from canonical UTC buffers (kept current as the user types).
        const depMin=hhmmToMin(ml.depTime||""),arrMin=hhmmToMin(ml.arrTime||"");
        let ftMin=null;
        if(depMin!==null&&arrMin!==null){ftMin=arrMin-depMin;if(ftMin<0)ftMin+=1440;}
        const modeColor=isL?C.amber:C.accent;
        const depUnknown=isL&&ml.origin&&tzOffsetFor(ml.origin)===null;
        const arrUnknown=isL&&ml.dest&&tzOffsetFor(ml.dest)===null;
        const timeBorderColor=isL?C.amber:C.border;
        const timeInputStyle={width:"100%",background:C.card,border:"1.5px solid "+timeBorderColor,borderRadius:8,padding:"9px 8px",color:C.text,fontSize:16,fontWeight:700,textAlign:"center",letterSpacing:1,boxSizing:"border-box"};
        const icaoInputStyle={width:"100%",background:C.card,border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 6px",color:C.text,fontSize:14,fontWeight:700,textAlign:"center",textTransform:"uppercase",letterSpacing:1,boxSizing:"border-box"};
        return(<div key={i} style={{background:C.bg,borderRadius:10,padding:12,marginBottom:10,border:"1px solid "+C.border,borderLeft:"3px solid "+lc}}>
          {/* Row 1: badge · date · origin → dest · Z|L toggle · X */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{background:lc,color:"#fff",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:800,letterSpacing:.4,flexShrink:0}}>LEG {i+1}</span>
            <input type="date" value={ml.date} onChange={e=>updateManualLeg(i,"date",e.target.value)}
              style={{flex:"1 1 130px",minWidth:120,background:C.card,border:"1.5px solid "+C.border,borderRadius:8,padding:"7px 8px",color:C.text,fontSize:12,fontWeight:700,boxSizing:"border-box"}}/>
            <input value={ml.origin} onChange={e=>updateManualLeg(i,"origin",e.target.value.toUpperCase().slice(0,4))} placeholder="ICAO" maxLength={4} style={{...icaoInputStyle,flex:"1 1 56px",minWidth:56}}/>
            <span style={{color:C.muted,fontSize:13,fontWeight:700,flexShrink:0}}>→</span>
            <input value={ml.dest} onChange={e=>updateManualLeg(i,"dest",e.target.value.toUpperCase().slice(0,4))} placeholder="ICAO" maxLength={4} style={{...icaoInputStyle,flex:"1 1 56px",minWidth:56}}/>
            <div style={{display:"flex",background:C.card,border:"1px solid "+C.border,borderRadius:6,padding:2,flexShrink:0}}>
              {["Z","L"].map(m=>(<button key={m} onClick={()=>setManualLegMode(i,m)} style={{padding:"4px 9px",borderRadius:4,border:"none",background:mode===m?(m==="L"?C.amber:C.accent):"transparent",color:mode===m?"#fff":C.muted,fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:.5}}>{m}</button>))}
            </div>
            {manualLegs.length>1&&<button onClick={()=>removeManualLeg(i)} style={{background:"transparent",border:"none",color:C.red,fontSize:16,cursor:"pointer",padding:"2px 6px",flexShrink:0}}>✕</button>}
          </div>
          {/* Row 2: dep — arr */}
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"end"}}>
            <div>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
                <span>Dep · {mode==="Z"?"Zulu":"Local"+(ml.origin?" ("+ml.origin+")":"")}</span>
                {depUnknown&&<span title="Unknown ICAO — treated as UTC+0" style={{color:C.amber,fontWeight:800}}>?</span>}
              </div>
              <input value={ml.depInput||""} onChange={e=>setManualLegTime(i,"dep",e.target.value)} placeholder="HH:MM" maxLength={5} inputMode="numeric" style={timeInputStyle}/>
            </div>
            <span style={{color:C.muted,fontSize:14,fontWeight:700,paddingBottom:11}}>—</span>
            <div>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4,display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                <span>Arr · {mode==="Z"?"Zulu":"Local"+(ml.dest?" ("+ml.dest+")":"")}</span>
                {arrUnknown&&<span title="Unknown ICAO — treated as UTC+0" style={{color:C.amber,fontWeight:800}}>?</span>}
              </div>
              <input value={ml.arrInput||""} onChange={e=>setManualLegTime(i,"arr",e.target.value)} placeholder="HH:MM" maxLength={5} inputMode="numeric" style={timeInputStyle}/>
            </div>
          </div>
          {/* Live flight time — appears once both times are valid */}
          {ftMin!==null&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <span style={{background:C.gold+"1f",color:C.gold,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:800,letterSpacing:.3}}>✈ {fmtHM(ftMin)}</span>
          </div>}
          {/* Row 3: per-leg crew config */}
          <div style={{marginTop:8}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Crew</div>
            <div style={{display:"flex",gap:0,background:C.card,borderRadius:7,padding:2,border:"1px solid "+C.border}}>
              {[2,3,4].map(n=>(<button key={n} onClick={()=>updateManualLeg(i,"crewMode",n)} style={{flex:1,padding:"5px 4px",borderRadius:5,border:"none",background:legCrew===n?C.accent+"22":"transparent",color:legCrew===n?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{n} Pilot</button>))}
            </div>
          </div>
        </div>);
      })}
      <button onClick={addManualLeg}
        style={{width:"100%",padding:10,borderRadius:8,border:"1.5px dashed "+C.accent+"66",background:"transparent",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer"}}>
        + Add Leg
      </button>
    </div>}

    {/* ── PASTE INPUT (top, always visible when no results) ── */}
    {!result&&!parsed&&dutyInputMode==="import"&&<div style={{background:C.card,border:"1.5px solid "+C.accent+"55",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text}}>📋 Paste Trip Schedule</div>
        <div style={{fontSize:10,color:C.muted}}>ARINCDirect format</div>
      </div>
      <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
        placeholder={"Tap here and paste your trip text from ARINCDirect\n\n21:00\nMMTO\n\nMYNN\n01:54\n\n(2:54)\nDuty: 3:14\nFlight: 2:54\nRest: 15:01\n..."}
        rows={8} style={{width:"100%",background:C.bg,border:"1.5px solid "+C.accent+"44",borderRadius:10,padding:"14px",color:C.text,fontSize:14,fontFamily:"monospace",lineHeight:1.6,resize:"vertical",outline:"none",boxSizing:"border-box",WebkitAppearance:"none"}}/>
      {parseError&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginTop:8}}>{parseError}</div>}
      <button onClick={handleParse} disabled={!pasteText.trim()}
        style={{width:"100%",marginTop:12,padding:14,borderRadius:12,background:pasteText.trim()?"linear-gradient(135deg,"+C.accent+",#2a5f85)":C.panel,border:"none",color:pasteText.trim()?"#fff":C.muted,fontSize:15,fontWeight:800,cursor:pasteText.trim()?"pointer":"default",opacity:pasteText.trim()?1:.5}}>
        Parse Trip
      </button>
      {/* Import options */}
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={()=>pdfRef.current?.click()} disabled={importing}
          style={{flex:2,background:C.bg,border:"1.5px solid "+C.accent+"44",borderRadius:8,padding:"10px 6px",color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          📄 Import PDF
        </button>
        <button onClick={()=>camRef.current?.click()} disabled={importing}
          style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,padding:"10px 6px",color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          📷
        </button>
        <button onClick={()=>imgRef.current?.click()} disabled={importing}
          style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,padding:"10px 6px",color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          🖼️
        </button>
      </div>
      {/* Paste screenshot box */}
      <div ref={pasteBoxRef} contentEditable suppressContentEditableWarning
        onPaste={handlePasteFromBox}
        style={{marginTop:10,background:C.bg,border:"2px dashed "+C.accent+"55",borderRadius:10,padding:"18px 14px",
          color:C.muted,fontSize:14,textAlign:"center",minHeight:44,outline:"none",cursor:"text",
          WebkitUserSelect:"text",userSelect:"text",lineHeight:1.5}}
        onFocus={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.accent+"08";}}>
        📋 Tap here, then long-press → Paste screenshot
      </div>
      {importing&&<div style={{marginTop:8,fontSize:12,color:C.accent,fontWeight:600,textAlign:"center"}}>{importMsg||"Processing..."}</div>}
      {importMsg&&!importing&&<div style={{marginTop:8,fontSize:12,color:importMsg.startsWith("✅")?C.green:importMsg.startsWith("❌")?C.red:C.accent,fontWeight:600,textAlign:"center"}}>{importMsg}</div>}
    </div>}

    {/* ── PASTED SCREENSHOT PREVIEW ── */}
    {pastedImg&&!parsed&&!result&&<div style={{background:C.card,border:"1.5px solid "+C.accent+"44",borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text}}>📋 Screenshot Captured</div>
        <button onClick={()=>setPastedImg(null)} style={{background:"transparent",border:"none",color:C.muted,fontSize:16,cursor:"pointer",padding:"2px 6px"}}>✕</button>
      </div>
      <img src={pastedImg} alt="Pasted screenshot" style={{width:"100%",borderRadius:8,border:"1px solid "+C.border,marginBottom:10}}/>
      <button onClick={handleOcrRead} disabled={ocrBusy||importing||!ocrReady}
        style={{width:"100%",padding:14,borderRadius:12,
          background:(ocrReady&&!ocrBusy)?"linear-gradient(135deg,"+C.accent+",#2a5f85)":C.panel,
          border:"none",color:(ocrReady&&!ocrBusy)?"#fff":C.muted,fontSize:15,fontWeight:800,
          cursor:(ocrReady&&!ocrBusy)?"pointer":"wait",opacity:(ocrReady&&!ocrBusy)?1:.6}}>
        {ocrBusy?(importMsg||"Reading..."):(ocrReady?"🔍 Read Screenshot":"Loading OCR engine...")}
      </button>
      {!ocrBusy&&<div style={{marginTop:8,fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.4}}>
        Reads text locally — no internet needed. Or send screenshot to Claude in chat for faster results.
      </div>}
    </div>}

    {/* ── PARSED PREVIEW (after successful parse) ── */}
    {!result&&parsed&&<div style={{background:C.card,border:"1.5px solid "+C.green+"44",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:10}}>✓ {parsed.legs.length} leg{parsed.legs.length>1?"s":""} parsed</div>
      {parsed.legs.map((leg,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,fontSize:12,flexWrap:"wrap"}}>
          <span style={{color:C.accent,fontWeight:700,minWidth:18}}>L{i+1}</span>
          <span style={{color:C.text,fontWeight:700}}>{leg.origin}→{leg.dest}</span>
          {leg.needsTimes
            ?<span style={{color:C.gold,fontWeight:700}}>??:??–??:??</span>
            :<><span style={{color:C.muted}}>{String(leg.depH).padStart(2,"0")}:{String(leg.depM).padStart(2,"0")}–{String(leg.arrH).padStart(2,"0")}:{String(leg.arrM).padStart(2,"0")}</span>
          <span style={{color:C.gold}}>{fmtHM(leg.flightMins)}</span></>}
          {leg.needsTimes&&<span style={{fontSize:9,background:C.gold+"22",color:C.gold,padding:"2px 6px",borderRadius:4,fontWeight:700}}>TAP EDIT</span>}
          {leg.hasRest&&<span style={{fontSize:9,background:C.green+"22",color:C.green,padding:"2px 6px",borderRadius:4,fontWeight:700}}>REST</span>}
        </div>))}

      {needDate&&<div style={{marginTop:12,background:C.bg,borderRadius:10,padding:14,border:"1.5px solid "+C.gold+"44"}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:8}}>Enter start date for first leg</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:8}}>
          <input type="number" min="1" max="31" value={startDay} onChange={e=>setStartDay(e.target.value)} placeholder="DD" style={{background:C.inputBg,border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 8px",color:C.text,fontSize:14,fontWeight:700,textAlign:"center"}}/>
          <select value={startMonth} onChange={e=>setStartMonth(e.target.value)} style={{background:C.inputBg,border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 8px",color:C.text,fontSize:14,fontWeight:700}}>
            {Object.keys(MONTHS).map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" min="24" max="30" value={startYear} onChange={e=>setStartYear(e.target.value)} placeholder="YY" style={{background:C.inputBg,border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 8px",color:C.text,fontSize:14,fontWeight:700,textAlign:"center"}}/>
        </div>
      </div>}

      {Object.keys(unknownIcaos).length>0&&<div style={{marginTop:12,background:C.bg,borderRadius:10,padding:14,border:"1.5px solid "+C.gold+"44"}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:8}}>Enter UTC offset for unknown airports</div>
        {Object.keys(unknownIcaos).map(icao=>(
          <div key={icao} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:700,color:C.text,minWidth:50}}>{icao}</span>
            <span style={{fontSize:11,color:C.muted}}>UTC</span>
            <input type="number" min="-12" max="14" step="1" value={sessionTz[icao]!==undefined?sessionTz[icao]:""} placeholder="±0"
              onChange={e=>{const v=Number(e.target.value);setSessionTz(prev=>({...prev,[icao]:v}));setUnknownIcaos(prev=>{const n={...prev};delete n[icao];return n;});}}
              style={{width:70,background:C.inputBg,border:"1.5px solid "+C.border,borderRadius:8,padding:"8px",color:C.text,fontSize:14,fontWeight:700,textAlign:"center"}}/>
          </div>))}
      </div>}

      {parseError&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginTop:8}}>{parseError}</div>}

      <div style={{display:"flex",gap:10,marginTop:14}}>
        <button onClick={()=>{setParsed(null);setNeedDate(false);setUnknownIcaos({});setCrewOverrides({});}} style={{flex:1,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>Re-paste</button>
        <button onClick={editLegs} style={{flex:1,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.accent+"44",color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer"}}>✏️ Edit</button>
        <button onClick={runCalc} style={{flex:2,padding:14,borderRadius:12,background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",letterSpacing:.3}}>Calculate →</button>
      </div>
    </div>}

    {/* Duty on/off defaults */}
    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Duty Offsets (defaults)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{label:"Before first leg (min 30)",val:dutyOnDef,set:setDutyOnDef,min:30},
          {label:"After last leg (min 10)",val:dutyOffDef,set:setDutyOffDef,min:10}].map(({label,val,set,min})=>{
          const n=Number(val);
          const below=val!==""&&Number.isFinite(n)&&n<min;
          return(<div key={label}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{label}</div>
            <div style={{position:"relative"}}>
              <input type="text" inputMode="numeric" value={val} placeholder={String(min)}
                onChange={e=>{set(e.target.value.replace(/[^0-9]/g,""));if(result)setResult(null);}}
                style={{width:"100%",background:C.bg,border:"1.5px solid "+(below?C.amber:C.border),borderRadius:8,padding:"9px 38px 9px 10px",color:C.text,fontSize:14,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
              <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.muted,pointerEvents:"none"}}>min</span>
            </div>
            {below&&<div style={{fontSize:10,color:C.amber,marginTop:3}}>Below {min} min minimum</div>}
          </div>);
        })}
      </div>
    </div>

    {/* ── CALCULATE (manual mode only, no result yet) ── */}
    {!result&&!parsed&&dutyInputMode==="manual"&&<div style={{marginBottom:14}}>
      {parseError&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginBottom:8}}>{parseError}</div>}
      <button onClick={parseManualLegs}
        style={{width:"100%",padding:14,borderRadius:12,background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
        Calculate Times
      </button>
    </div>}

    {/* ══ RESULTS ══ */}
    {result&&(()=>{
      const crewModesUsed=[...new Set(result.dutyResults.map(d=>d.crewMode))];
      const mixedCrew=crewModesUsed.length>1;
      const hdrLim=mixedCrew?null:(result.dutyResults[0]?result.dutyResults[0].limits:limits);
      return(<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:C.accent+"22",color:C.accent,padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:800,letterSpacing:.5}}>{mixedCrew?"MIXED CREW":hdrLim.label.toUpperCase()}</span>
          <span style={{fontSize:11,color:C.muted}}>{mixedCrew?"varies by duty period":hdrLim.reg}</span>
        </div>
        <div style={{display:"flex",gap:0,background:C.bg,borderRadius:7,padding:2,border:"1px solid "+C.border}}>
          {["local","zulu"].map(m=>(<button key={m} onClick={()=>setTimeMode(m)} style={{padding:"4px 10px",borderRadius:5,border:"none",background:timeMode===m?C.accent+"22":"transparent",color:timeMode===m?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"uppercase"}}>{m==="local"?"LCL":"UTC"}</button>))}
        </div>
      </div>

      {result.violations.length>0&&<div style={{background:C.red+"12",border:"2px solid "+C.red+"44",borderRadius:14,padding:16,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:20}}>🚨</span><div style={{fontSize:14,fontWeight:800,color:C.red}}>{result.violations.length} Violation{result.violations.length>1?"s":""}</div></div>
        {result.violations.map((v,i)=>(
          <div key={i} style={{fontSize:12,color:C.text,lineHeight:1.7,paddingBottom:i<result.violations.length-1?8:0,borderBottom:i<result.violations.length-1?"1px solid "+C.red+"22":"none",marginBottom:i<result.violations.length-1?8:0}}>
            <span style={{fontWeight:700,color:C.red}}>{v.type==="duty"?"DUTY":v.type==="flight"?"FLIGHT":v.type==="rest"?"REST":"24HR"}</span>{" "}{v.msg}
          </div>))}
      </div>}

      {result.dutyResults.map((dp,i)=>{
        const worst=dp.dutyStatus==="red"||dp.flightStatus==="red"?"red":dp.dutyStatus==="amber"||dp.flightStatus==="amber"?"amber":"green";
        const wc=statusColor(worst);
        return(<div key={i} style={{background:C.card,border:"1.5px solid "+wc+"44",borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{background:wc+"22",color:wc,padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:800}}>Duty Period {i+1}</span>
              <span style={{fontSize:12,color:C.text,fontWeight:700}}>{dp.legs.length} leg{dp.legs.length>1?"s":""}</span>
            </div>
            <span style={{fontSize:10,color:wc,fontWeight:700,textTransform:"uppercase"}}>{statusLabel(worst)}</span>
          </div>
          {/* Per-duty-period crew config */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>Crew · {dp.limits.reg}</div>
            <div style={{display:"flex",gap:0,background:C.bg,borderRadius:8,padding:2,border:"1px solid "+C.border}}>
              {[2,3,4].map(n=>(<button key={n} onClick={()=>{const no={...crewOverrides,[i]:n};setCrewOverrides(no);recomputeWith(no);}} style={{flex:1,padding:"6px 4px",borderRadius:6,border:"none",background:dp.crewMode===n?C.accent+"22":"transparent",color:dp.crewMode===n?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{n} Pilot</button>))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[{l:"Duty On",v:fmtEpochT(dp.dutyStart,timeMode==="zulu")},{l:"Duty Off",v:fmtEpochT(dp.dutyEnd,timeMode==="zulu")}].map(({l,v})=>(
              <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.4}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:C.text,marginTop:2}}>{v}</div></div>))}
          </div>
          {/* Duty bar */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.muted}}>Duty</span><span style={{color:statusColor(dp.dutyStatus),fontWeight:700}}>{fmtHrs2(dp.dutyHrs)} / {dp.limits.duty}h</span></div>
            <div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,dp.dutyHrs/dp.limits.duty*100)+"%",background:statusColor(dp.dutyStatus),borderRadius:3,transition:"width 0.3s"}}/></div>
          </div>
          {/* Flight bar */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.muted}}>Flight</span><span style={{color:statusColor(dp.flightStatus),fontWeight:700}}>{fmtHrs2(dp.flightHrs)} / {dp.limits.flight}h</span></div>
            <div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,dp.flightHrs/dp.limits.flight*100)+"%",background:statusColor(dp.flightStatus),borderRadius:3,transition:"width 0.3s"}}/></div>
          </div>
          {dp.restBefore!==undefined&&<div style={{background:(dp.restBefore>=dp.limits.rest?C.green:C.red)+"0d",border:"1px solid "+(dp.restBefore>=dp.limits.rest?C.green:C.red)+"33",borderRadius:8,padding:"6px 10px",marginBottom:10,display:"flex",justifyContent:"space-between",fontSize:11}}>
            <span style={{color:C.muted}}>Rest before</span><span style={{color:dp.restBefore>=dp.limits.rest?C.green:C.red,fontWeight:700}}>{fmtHrs2(dp.restBefore)} (min {dp.limits.rest}h)</span>
          </div>}
          {/* Per-duty offsets */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{flex:1}}><div style={{fontSize:9,color:C.muted,marginBottom:3}}>On offset</div>
              <select value={customOffsets[i]?.on??dutyOnDef} onChange={e=>{handleOffsetChange(i,"on",e.target.value);setResult(null);}} style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,padding:"6px",color:C.text,fontSize:12}}>
                {[30,45,60,75,90,120].map(v=><option key={v} value={v}>{v}m</option>)}</select></div>
            <div style={{flex:1}}><div style={{fontSize:9,color:C.muted,marginBottom:3}}>Off offset</div>
              <select value={customOffsets[i]?.off??dutyOffDef} onChange={e=>{handleOffsetChange(i,"off",e.target.value);setResult(null);}} style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,padding:"6px",color:C.text,fontSize:12}}>
                {[10,15,20,30,45,60].map(v=><option key={v} value={v}>{v}m</option>)}</select></div>
          </div>
          {/* Legs */}
          {dp.legs.map((leg,li)=>(
            <div key={li} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderTop:li>0?"1px solid "+C.border:"none",fontSize:12}}>
              <span style={{color:C.accent,fontWeight:700,minWidth:42}}>Leg {(result.allLegs.findIndex(al=>al.depEpoch===leg.depEpoch))+1}</span>
              <span style={{color:C.text,fontWeight:700}}>{leg.origin}→{leg.dest}</span>
              <span style={{color:C.muted,flex:1,textAlign:"right"}}>{String(leg.depH).padStart(2,"0")}:{String(leg.depM).padStart(2,"0")}–{String(leg.arrH).padStart(2,"0")}:{String(leg.arrM).padStart(2,"0")}</span>
              <span style={{color:C.gold,fontWeight:700,minWidth:40,textAlign:"right"}}>{fmtHM(leg.flightMins)}</span>
            </div>))}
        </div>);
      })}

      {/* Totals */}
      <div style={{background:C.card,border:"1.5px solid "+C.accent+"44",borderRadius:14,padding:16,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Trip Totals</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[{l:"Total Flight",v:fmtHrs2(result.totalFlight),c:C.text},{l:"Total Duty",v:fmtHrs2(result.totalDuty),c:C.text},{l:"Total Rest",v:fmtHrs2(result.totalRest),c:C.text},{l:"Duty Periods",v:String(result.dutyResults.length),c:C.gold}].map(({l,v,c})=>(
            <div key={l} style={{background:C.bg,borderRadius:8,padding:"10px 10px",textAlign:"center"}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:2}}>{l}</div><div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div></div>))}
        </div>
      </div>

      {/* End of mission rest */}
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🛏️</span>
          <div><div style={{fontSize:12,fontWeight:700,color:C.text}}>Required Rest After Mission</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>
              {(()=>{const lastLim=result.dutyResults.length>0?result.dutyResults[result.dutyResults.length-1].limits:limits;return`Minimum ${lastLim.rest} hrs before next duty`;})()}
              {result.dutyResults.length>0&&(()=>{const last=result.dutyResults[result.dutyResults.length-1];return` · Available at ${fmtEpochT(last.dutyEnd+last.limits.rest*3600000,timeMode==="zulu")}`;})()}
            </div></div></div>
      </div>

      {/* Explain */}
      <button onClick={()=>setShowExplain(!showExplain)}
        style={{width:"100%",marginTop:4,padding:"14px 16px",borderRadius:12,background:showExplain?C.accent+"15":C.card,border:"1.5px solid "+(showExplain?C.accent+"66":C.accent+"44"),color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <span style={{fontSize:18}}>💡</span>{showExplain?"Hide Explanation":"Explain in Plain English"}
        <span style={{fontSize:12,display:"inline-block",transition:"transform 0.2s",transform:showExplain?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
      </button>

      {showExplain&&(()=>{
        const lim=result.limits;
        const crewModesUsed=[...new Set(result.dutyResults.map(d=>d.crewMode))];
        const mixedCrew=crewModesUsed.length>1;
        const sumLim=mixedCrew?null:(result.dutyResults[0]?result.dutyResults[0].limits:lim);
        const pad=n=>String(n).padStart(2,"0");
        const utcStr=(h,m)=>`${pad(h)}:${pad(m)}`;
        const localStr=(h,m,icao)=>{
          const tz=ICAO_TZ[icao];const sTz=sessionTz[icao];
          const offset=tz!==undefined?tz:(sTz!==undefined&&sTz!==""&&!isNaN(sTz)?Number(sTz):null);
          if(offset===null)return null;
          const total=((h*60+m)+offset*60+1440*7)%1440;
          return`${pad(Math.floor(total/60))}:${pad(total%60)}`;
        };
        const dateLabel=ms=>{const d=new Date(ms);return`${d.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}`;};
        const r24v=result.violations.filter(v=>v.type==="rolling24");
        const goNoGo=result.violations.length===0;
        return(<div style={{marginTop:12,borderRadius:14,overflow:"hidden",border:"1.5px solid "+C.accent+"33",background:C.card}}>
          {/* Header */}
          <div style={{padding:"10px 14px",background:C.panel,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid "+C.border}}>
            <span style={{fontSize:16}}>💡</span><div><div style={{fontSize:12,fontWeight:800,color:C.light}}>What This Means</div><div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>Plain English breakdown of your 10/24 assessment</div></div>
          </div>

          {/* 1. Crew rules summary */}
          <div style={{padding:"12px 14px",borderBottom:"1px solid "+C.border,background:C.bg}}>
            {mixedCrew?(
              <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <span style={{background:C.accent,color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:800,letterSpacing:.4}}>👥 MIXED CREW</span>
                <span style={{fontSize:11,color:C.sub,fontWeight:600}}>Crew config varies by duty period — limits shown on each below.</span>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <span style={{background:C.accent,color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:800,letterSpacing:.4}}>👥 {sumLim.label.toUpperCase()}</span>
                <span style={{fontSize:11,color:C.sub,fontWeight:600}}>Duty max <b style={{color:C.text}}>{sumLim.duty}h</b></span>
                <span style={{fontSize:11,color:C.sub,fontWeight:600}}>Flight max <b style={{color:C.text}}>{sumLim.flight}h</b></span>
                <span style={{fontSize:11,color:C.sub,fontWeight:600}}>Min rest <b style={{color:C.text}}>{sumLim.rest}h</b></span>
                <span style={{fontSize:11,color:C.sub,fontWeight:600}}>24h rolling <b style={{color:C.text}}>{sumLim.rolling24}h</b></span>
              </div>
            )}
          </div>

          {/* 2. Duty period sections + 3. Rest bars */}
          <div style={{padding:"12px 14px"}}>
            {result.dutyResults.map((dp,dpi)=>{
              const dpLim=dp.limits;
              const dutyOk=dp.dutyHrs<=dpLim.duty,flightOk=dp.flightHrs<=dpLim.flight;
              const dutyPct=Math.round(dp.dutyHrs/dpLim.duty*100),flightPct=Math.round(dp.flightHrs/dpLim.flight*100);
              const restOk=dp.restBefore===undefined||dp.restBefore>=dpLim.rest;
              const exceeded=!dutyOk||!flightOk||!restOk;
              const caution=!exceeded&&((dutyPct>=80)||(flightPct>=80));
              const dpLabel=exceeded?"EXCEEDED":caution?"CAUTION":"ALL CLEAR";
              const dpColor=exceeded?C.red:caution?C.amber:C.green;
              return(<React.Fragment key={dpi}>
                {/* Rest bar between periods */}
                {dpi>0&&dp.restBefore!==undefined&&(()=>{
                  const ok=dp.restBefore>=dpLim.rest;
                  return(<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",margin:"4px 0 10px",background:(ok?C.green:C.red)+"14",borderRadius:10,border:"1px solid "+(ok?C.green:C.red)+"44"}}>
                    <span style={{fontSize:14}}>🛏️</span>
                    <div style={{flex:1,fontSize:12,color:C.text,fontWeight:600}}>
                      Rest: <b style={{color:ok?C.green:C.red}}>{fmtHrs2(dp.restBefore)}</b>
                      <span style={{color:C.muted,fontWeight:500}}> · minimum {dpLim.rest}h ({dpLim.label})</span>
                    </div>
                    <span style={{fontSize:11,color:ok?C.green:C.red,fontWeight:800}}>{ok?"✅":"❌"}</span>
                  </div>);
                })()}
                {/* DP card */}
                <div style={{border:"1.5px solid "+dpColor+"55",borderRadius:12,marginBottom:10,overflow:"hidden",background:C.card}}>
                  {/* DP header */}
                  <div style={{padding:"10px 12px",background:dpColor+"12",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",borderBottom:"1px solid "+C.border}}>
                    <span style={{background:dpColor,color:"#fff",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:800}}>Duty Period {dpi+1}</span>
                    <span style={{background:C.accent+"22",color:C.accent,borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:800}}>👥 {dpLim.label}</span>
                    <span style={{fontSize:12,color:C.text,fontWeight:600}}>{dateLabel(dp.dutyStart)}</span>
                    <span style={{fontSize:11,color:C.muted,fontWeight:500}}>· {dp.legs.length} leg{dp.legs.length>1?"s":""}</span>
                    <span style={{marginLeft:"auto",fontSize:10,color:dpColor,fontWeight:800,letterSpacing:.4}}>{dpLabel}</span>
                  </div>
                  {/* Route cards */}
                  <div style={{padding:"10px 12px"}}>
                    {dp.legs.map((leg,li)=>{
                      const dl=localStr(leg.depH,leg.depM,leg.origin);
                      const al=localStr(leg.arrH,leg.arrM,leg.dest);
                      const globalIdx=result.allLegs.findIndex(a=>a.depEpoch===leg.depEpoch&&a.origin===leg.origin&&a.dest===leg.dest);
                      const lc=dutyLegColor(globalIdx>=0?globalIdx:li);
                      return(<div key={li} style={{background:C.bg,border:"1px solid "+C.border,borderLeft:"3px solid "+lc,borderRadius:10,padding:"10px 12px",marginBottom:li<dp.legs.length-1?8:0}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,gap:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                            <span style={{background:lc,color:"#fff",borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:800,letterSpacing:.4,flexShrink:0}}>Leg {(globalIdx>=0?globalIdx:li)+1}</span>
                            <div style={{fontSize:13,fontWeight:800,color:C.text,letterSpacing:.3}}>{leg.origin} → {leg.dest}</div>
                          </div>
                          <div style={{fontSize:11,color:C.muted,fontWeight:700,flexShrink:0}}>✈️ {fmtHrs2(leg.flightMins/60)}</div>
                        </div>
                        <div style={{fontSize:11,color:C.sub,fontFamily:"ui-monospace,Menlo,monospace",marginBottom:dl&&al?2:0}}>
                          {utcStr(leg.depH,leg.depM)} – {utcStr(leg.arrH,leg.arrM)} <span style={{color:C.muted,fontSize:10}}>(UTC)</span>
                        </div>
                        {dl&&al&&<div style={{fontSize:11,color:C.sub,fontFamily:"ui-monospace,Menlo,monospace"}}>
                          {dl} {leg.origin} local → {al} {leg.dest} local
                        </div>}
                      </div>);
                    })}
                  </div>
                  {/* Check rows */}
                  <div style={{padding:"0 12px 10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:"1px solid "+C.border}}>
                      <span style={{fontSize:14,width:18,textAlign:"center"}}>{dutyOk?(dutyPct>=80?"⚠️":"✅"):"❌"}</span>
                      <div style={{flex:1,fontSize:12,color:C.text}}>Duty time <b>{fmtHrs2(dp.dutyHrs)}</b> {dutyOk?"within":"exceeds"} {dpLim.duty}h limit</div>
                      {dutyPct>=80&&<span style={{fontSize:11,fontWeight:800,color:!dutyOk?C.red:C.amber}}>{dutyPct}%</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:"1px solid "+C.border}}>
                      <span style={{fontSize:14,width:18,textAlign:"center"}}>{flightOk?(flightPct>=80?"⚠️":"✅"):"❌"}</span>
                      <div style={{flex:1,fontSize:12,color:C.text}}>Flight time <b>{fmtHrs2(dp.flightHrs)}</b> {flightOk?"within":"exceeds"} {dpLim.flight}h limit</div>
                      {flightPct>=80&&<span style={{fontSize:11,fontWeight:800,color:!flightOk?C.red:C.amber}}>{flightPct}%</span>}
                    </div>
                    {dp.restBefore!==undefined&&(()=>{
                      const ok=dp.restBefore>=dpLim.rest;
                      return(<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:"1px solid "+C.border}}>
                        <span style={{fontSize:14,width:18,textAlign:"center"}}>{ok?"✅":"❌"}</span>
                        <div style={{flex:1,fontSize:12,color:C.text}}>Rest before <b>{fmtHrs2(dp.restBefore)}</b> {ok?"meets":"below"} {dpLim.rest}h minimum</div>
                      </div>);
                    })()}
                  </div>
                </div>
              </React.Fragment>);
            })}

            {/* 4. Rolling 24-hour check */}
            {(()=>{
              const ok=r24v.length===0;
              return(<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",marginTop:4,background:(ok?C.green:C.red)+"14",borderRadius:10,border:"1px solid "+(ok?C.green:C.red)+"44"}}>
                <span style={{fontSize:14}}>{ok?"✅":"❌"}</span>
                <div style={{flex:1,fontSize:12,color:C.text,fontWeight:600}}>
                  Rolling 24-hour flight time {ok?(mixedCrew?"within each period's limit":`within ${sumLim.rolling24}h limit`):`exceeded — ${r24v.length} violation${r24v.length>1?"s":""}`}
                </div>
                <span style={{fontSize:11,color:ok?C.green:C.red,fontWeight:800}}>{ok?"PASS":"FAIL"}</span>
              </div>);
            })()}

            {/* 5. GO / NO-GO verdict */}
            <div style={{marginTop:14,padding:"16px 14px",textAlign:"center",borderRadius:12,background:goNoGo?C.green:C.red,color:"#fff",fontSize:18,fontWeight:900,letterSpacing:1}}>
              {goNoGo?"🟢 GO":"🔴 NO-GO"}
              <div style={{fontSize:11,fontWeight:600,opacity:.9,marginTop:4,letterSpacing:.3}}>
                {goNoGo?`All limits satisfied for ${mixedCrew?"the selected crew configs":sumLim.label+" operations"}`:`${result.violations.length} violation${result.violations.length>1?"s":""} — not compliant with ${mixedCrew?"FAR 135.267/.269":sumLim.reg}`}
              </div>
            </div>
          </div>

          {/* 6. Footer */}
          <div style={{padding:"10px 14px",borderTop:"1px solid "+C.border,fontSize:10,color:C.muted,textAlign:"center",lineHeight:1.5}}>{mixedCrew?"FAR 135.267/.269 · Mixed crew":sumLim.reg+" · "+sumLim.label} · For planning purposes only</div>
        </div>);
      })()}

      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={editLegs} style={{flex:1,padding:14,borderRadius:12,background:C.accent,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>✏️ Edit Legs</button>
        <button onClick={resetAll} style={{flex:1,padding:14,borderRadius:12,background:C.card,border:"1.5px solid "+C.border,color:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>← New Calculation</button>
      </div>
    </div>);})()}
  </>);
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function E6B(){
  const wide=useWide();
  const theme=useTheme();
  const[screen,setScreen]=useState("calc");
  const[currency,setCurrency]=useState(CURRENCIES[0]);
  const[aircraftId,setAircraftId]=useState("gv");
  const[profiles,setProfiles]=useState([]);
  const[history,setHistory]=useState([]);
  const[results,setResults]=useState([]);
  const[calculated,setCalculated]=useState(false);
  const[editingAc,setEditingAc]=useState(null);
  const[globalAlt,setGlobalAlt]=useState("39000");
  const[reserveFuel,setReserveFuel]=useState("6000");
  const[initialFob,setInitialFob]=useState("");
  const[legs,setLegs]=useState([newLeg(),newLeg()]);
  const[importing,setImporting]=useState(false);
  const[importMsg,setImportMsg]=useState("");
  const[showPaste,setShowPaste]=useState(false);
  const[pasteText,setPasteText]=useState("");
  const[briefModal,setBriefModal]=useState(null);
  const[showMath,setShowMath]=useState(false);
  const priceMemory=useRef({});
  const imgRef=useRef();
  const pdfRef=useRef();

  useEffect(()=>{(async()=>{
    const h=await recall("e6b:hist");if(h)setHistory(h);
    const p=await recall("e6b:profiles");if(p)setProfiles(p);
  })();},[]);

  const currentAc=aircraftId==="gv"?GV:profiles.find(p=>p.id===aircraftId)||GV;
  const sym=currency.symbol;
  const acOpts=[{v:"gv",l:"Gulfstream V (GV)"},...profiles.map(p=>({v:p.id,l:p.name}))];

  // Auto-recalculate when inputs change and results are already showing
  const calcRef=useRef(false);
  useEffect(()=>{
    if(!calcRef.current)return;
    const res=[];
    let chainedFob=Number(initialFob||0);
    for(let i=0;i<legs.length;i++){
      const leg=legs[i];
      const fobForLeg=i===0?Number(initialFob||0):(leg.useOverride?Number(leg.fobOverride||0):chainedFob);
      const r=calcLeg(currentAc,leg,globalAlt,reserveFuel,fobForLeg,legs[i+1]||null);
      res.push(r);chainedFob=r.arrivalFob;
    }
    setResults(res);
  },[initialFob,aircraftId,globalAlt,reserveFuel,currency.code]);
  function addLeg(){const lastTo=legs[legs.length-1]?.to||"";setLegs(ls=>[...ls,newLeg(lastTo)]);setCalculated(false);calcRef.current=false;}
  function removeLeg(i){setLegs(ls=>ls.filter((_,j)=>j!==i));setCalculated(false);calcRef.current=false;}

  function updateLeg(i,leg,prev){
    const pm=priceMemory.current;
    const prevLeg=prev||{};
    // Remember prices in session memory
    if(leg.depPrice&&leg.depPrice!==prevLeg.depPrice&&leg.from?.length>=3)pm[leg.from.toUpperCase()]=leg.depPrice;
    if(leg.arrPrice&&leg.arrPrice!==prevLeg.arrPrice&&leg.to?.length>=3)pm[leg.to.toUpperCase()]=leg.arrPrice;
    // Auto-fill from session memory when ICAO changes
    if(leg.from!==prevLeg.from&&leg.from?.length>=3&&!leg.depPrice&&pm[leg.from.toUpperCase()])
      leg={...leg,depPrice:pm[leg.from.toUpperCase()]};
    if(leg.to!==prevLeg.to&&leg.to?.length>=3&&!leg.arrPrice&&pm[leg.to.toUpperCase()])
      leg={...leg,arrPrice:pm[leg.to.toUpperCase()]};
    setLegs(ls=>{
      const next=[...ls];next[i]=leg;
      // Carry arr price forward to next leg dep
      if(i<next.length-1&&leg.arrPrice&&leg.arrPrice!==prevLeg.arrPrice){
        const nd=next[i+1];
        if(!nd.depPrice||nd.depPrice===prevLeg.arrPrice)next[i+1]={...nd,depPrice:leg.arrPrice};
      }
      return next;
    });
    setCalculated(false);
  }

  function runCalc(){
    const res=[];
    let chainedFob=Number(initialFob||0);
    for(let i=0;i<legs.length;i++){
      const leg=legs[i];
      const fobForLeg=i===0?Number(initialFob||0):(leg.useOverride?Number(leg.fobOverride||0):chainedFob);
      const r=calcLeg(currentAc,leg,globalAlt,reserveFuel,fobForLeg,legs[i+1]||null);
      res.push(r);chainedFob=r.arrivalFob;
    }
    setResults(res);setCalculated(true);calcRef.current=true;
    const totalSavings=res.reduce((s,r)=>s+(r?.savings||0),0);
    const entry={id:Date.now(),legs,results:res,totalSavings,aircraft:currentAc.name,currency:currency.code,globalAlt,reserveFuel,ts:new Date().toISOString()};
    const nh=[entry,...history].slice(0,30);setHistory(nh);store("e6b:hist",nh);
  }

  // Load Tesseract for Calc tab OCR
  useEffect(()=>{loadTesseract(()=>{});},[]);

  async function handleImageImport(e){
    const file=e.target.files[0];if(!file)return;
    e.target.value="";setImporting(true);
    try{
      setImportMsg("Reading image...");
      const text=await ocrFromFile(file,msg=>setImportMsg(msg));
      if(!text||!text.trim()){
        setShowPaste(true);setImportMsg("❌ OCR found no text — paste trip text below");
        setTimeout(()=>setImportMsg(""),6000);setImporting(false);return;
      }
      setImportMsg("Parsing legs...");
      const parsed=parseTripText(text);
      if(parsed&&parsed.length>0){
        const newLegs=parsed.map(p=>({...newLeg(p.from||""),from:p.from||"",to:p.to||"",distNm:p.distNm?String(p.distNm):"",plannedBurnLbs:p.plannedBurnLbs?String(p.plannedBurnLbs):"",cruiseAltFt:p.cruiseAltFt?String(p.cruiseAltFt):""}));
        for(let pi=1;pi<newLegs.length;pi++)newLegs[pi].from=newLegs[pi-1].to;
        setLegs(newLegs);setCalculated(false);setImportMsg("✅ "+parsed.length+" legs imported — add fuel prices");
        setTimeout(()=>setImportMsg(""),4000);
      }else{
        // Couldn't auto-parse — dump OCR text into paste field
        setPasteText(text);setShowPaste(true);
        setImportMsg("📋 Text extracted — review and hit Parse");
      }
    }catch(err){
      setShowPaste(true);setImportMsg("❌ "+err.message.slice(0,50));
      setTimeout(()=>setImportMsg(""),6000);
    }
    setImporting(false);
  }

  function handlePasteImport(){
    if(!pasteText.trim())return;
    try{
      const parsed=parseTripText(pasteText);
      if(!parsed||parsed.length===0){setImportMsg("❌ No legs found — check format");setTimeout(()=>setImportMsg(""),5000);return;}
      const newLegs=parsed.map(p=>({...newLeg(p.from||""),from:p.from||"",to:p.to||"",distNm:p.distNm?String(p.distNm):"",plannedBurnLbs:p.plannedBurnLbs?String(p.plannedBurnLbs):"",cruiseAltFt:p.cruiseAltFt?String(p.cruiseAltFt):""}));
      for(let pi=1;pi<newLegs.length;pi++)newLegs[pi].from=newLegs[pi-1].to;
      setLegs(newLegs);setCalculated(false);setPasteText("");setShowPaste(false);
      setImportMsg("✅ "+parsed.length+" legs imported — add fuel prices");
      setTimeout(()=>setImportMsg(""),5000);
    }catch(err){setImportMsg("❌ "+err.message.slice(0,50));setTimeout(()=>setImportMsg(""),5000);}
  }

  async function handleTripSheetPdf(e){
    const file=e.target.files[0];if(!file)return;
    e.target.value="";setImporting(true);setImportMsg("Reading trip sheet PDF...");
    try{
      const text=await extractPdfText(file);
      if(!text||!text.trim()){setImportMsg("❌ No text found in PDF");setTimeout(()=>setImportMsg(""),6000);setImporting(false);return;}
      setImportMsg("Parsing trip sheet...");
      const parsed=parseTripSheetPDF(text);
      if(parsed&&parsed.legs&&parsed.legs.length>0){
        const newLegs=parsed.legs.map(p=>({...newLeg(p.from||""),
          from:p.from||"",to:p.to||"",
          distNm:p.distNm?String(p.distNm):"",
          plannedBurnLbs:p.plannedBurnLbs?String(p.plannedBurnLbs):"",
          depPrice:p.depPrice||"",arrPrice:p.arrPrice||"",
          depRampFee:p.depRampFee||"",depMinPurchase:p.depMinPurchase||""}));
        for(let pi=1;pi<newLegs.length;pi++)newLegs[pi].from=newLegs[pi-1].to;
        setLegs(newLegs);setCalculated(false);calcRef.current=false;
        const route=newLegs.map(l=>l.from).concat(newLegs[newLegs.length-1].to).join(" → ");
        const tripLabel=parsed.tripNum?"Trip #"+parsed.tripNum+": ":"";
        const n=newLegs.length;
        setImportMsg("✅ "+tripLabel+route+" — "+n+" leg"+(n>1?"s":"")+" imported with fuel prices");
        setTimeout(()=>setImportMsg(""),7000);
      }else{
        setImportMsg("❌ Couldn't read trip-sheet format — try Paste or Photo");
        setTimeout(()=>setImportMsg(""),7000);
      }
    }catch(err){setImportMsg("❌ PDF error: "+(err.message||"").slice(0,60));setTimeout(()=>setImportMsg(""),8000);}
    setImporting(false);
  }

  async function saveProfile(p){
    const np=p.id&&profiles.find(x=>x.id===p.id)?profiles.map(x=>x.id===p.id?p:x):[...profiles,{...p,id:"ac_"+Date.now()}];
    setProfiles(np);await store("e6b:profiles",np);setEditingAc(null);
  }
  async function deleteProfile(id){const np=profiles.filter(p=>p.id!==id);setProfiles(np);await store("e6b:profiles",np);if(aircraftId===id)setAircraftId("gv");}

  const totalSavings=results.reduce((s,r)=>s+(r?.savings||0),0);
  const totalExtra=results.reduce((s,r)=>s+(r?.tankerLbs||0),0);

  // FOB input with numpad
  function FobField(){
    const[showPad,setShowPad]=useState(false);
    const hasKb=useHasKeyboard();
    const[local,setLocal]=useState(initialFob);
    const focusedRef=useRef(false);
    useEffect(()=>{if(!focusedRef.current)setLocal(initialFob);},[initialFob]);
    const commit=()=>{focusedRef.current=false;if(local!==initialFob)setInitialFob(local);};
    if(hasKb)return(<div style={{position:"relative"}}>
      <input type="text" inputMode="decimal" value={local}
        onChange={e=>setLocal(e.target.value)}
        onFocus={e=>{focusedRef.current=true;e.target.select();}}
        onBlur={commit}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();e.target.blur();}}}
        style={{width:"100%",background:C.inputBg,border:"1.5px solid "+C.accent+"55",borderRadius:8,padding:"11px 40px 11px 14px",color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
      <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setShowPad(true)} title="Open numpad"
        style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",background:C.accent+"1a",border:"1px solid "+C.accent+"44",borderRadius:6,padding:"4px 6px",fontSize:14,lineHeight:1,cursor:"pointer",color:C.accent}}>🔢</button>
      {showPad&&<NumPadOverlay onClose={()=>setShowPad(false)}>
        <NumPad value={initialFob} label="Fuel On Board (lbs)" step="100"
          onChange={v=>{setLocal(v);setInitialFob(v);setShowPad(false);}}
          onClose={()=>setShowPad(false)}/>
      </NumPadOverlay>}
    </div>);
    return(<div style={{position:"relative"}}>
      <input readOnly value={initialFob} onClick={()=>setShowPad(true)}
        style={{width:"100%",background:C.inputBg,border:"1.5px solid "+C.accent+"55",borderRadius:8,padding:"11px 14px",color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box",cursor:"pointer"}}/>
      {showPad&&<NumPadOverlay onClose={()=>setShowPad(false)}>
        <NumPad value={initialFob} label="Fuel On Board (lbs)" step="100"
          onChange={v=>{setInitialFob(v);setShowPad(false);}}
          onClose={()=>setShowPad(false)}/>
      </NumPadOverlay>}
    </div>);
  }

  return(<>
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif",color:C.text,maxWidth:wide?960:640,margin:"0 auto"}}>
      <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp,image/*" style={{display:"none"}} onChange={handleImageImport}/>
      <input ref={pdfRef} type="file" accept=".pdf,application/pdf" style={{display:"none"}} onChange={handleTripSheetPdf}/>

      {/* Header */}
      <div style={{background:C.panel,borderBottom:"1px solid #0f172a55",padding:wide?"13px 24px":"13px 16px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",borderRadius:10,width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⛽</div>
            <div><div style={{fontSize:16,fontWeight:800,letterSpacing:.3,color:C.light}}>E6B</div><div style={{fontSize:10,color:C.light+"99",letterSpacing:.5,marginTop:1}}>FUEL TANKERING MODULE · v{APP_VERSION}</div></div>
            {/* Theme override toggle: Auto → Light → Dark → Auto. Anchored next to
                the title so it can't be clipped by the nav-tab row on mobile. */}
            <button onClick={theme.cycle} title={"Theme: "+theme.mode+" (tap to change)"}
              style={{padding:wide?"7px 11px":"6px 9px",borderRadius:999,border:"1px solid #94a3b844",background:"#94a3b81a",color:"#cbd5e1",fontSize:wide?14:13,fontWeight:700,cursor:"pointer",lineHeight:1,minWidth:wide?42:36,height:wide?34:30,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {theme.mode==="light"?"☀️":theme.mode==="dark"?"🌙":"Auto"}
            </button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:wide?8:5}}>
            {[{s:"calc",l:"Tanker Calc"},{s:"pcn",l:"PCN"},{s:"bke",l:"BKE"},{s:"duty",l:"10/24"},{s:"aircraft",l:"Aircraft"},{s:"history",l:"History"}].map(({s,l})=>(
              <button key={s} onClick={()=>setScreen(s)}
                style={{padding:wide?"8px 16px":"6px 12px",borderRadius:7,border:"none",background:screen===s?C.accent+"33":"transparent",color:screen===s?"#93c5fd":"#94a3b8",fontSize:wide?14:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{padding:wide?"20px 24px 100px":"14px 14px 100px"}}>
        {screen==="calc"&&<>
          {/* Import banner */}
          <div style={{background:C.card,border:"1px solid "+C.accent+"44",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:3}}>📄 Import Trip Sheet</div>
                <div style={{fontSize:12,color:C.muted}}>Upload a GAC Flight Release PDF, or screenshot a flight plan</div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}}>
                <button onClick={()=>pdfRef.current?.click()} disabled={importing}
                  style={{background:importing?"transparent":C.accent,border:"1.5px solid "+C.accent,borderRadius:9,padding:"10px 16px",color:importing?C.accent:"#fff",fontSize:13,fontWeight:700,cursor:importing?"default":"pointer"}}>
                  {importing?"Reading...":"📄 Upload Trip Sheet"}
                </button>
                <button onClick={()=>imgRef.current?.click()} disabled={importing}
                  style={{background:"transparent",border:"1.5px solid "+C.accent,borderRadius:9,padding:"10px 16px",color:C.accent,fontSize:13,fontWeight:700,cursor:importing?"default":"pointer"}}>
                  📸 Photo
                </button>
              </div>
            </div>
            {importMsg&&<div style={{marginTop:10,fontSize:13,color:importMsg.startsWith("✅")?C.green:importMsg.startsWith("❌")?C.red:C.gold,fontWeight:500}}>{importMsg}</div>}
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+C.border}}>
              <button onClick={()=>setShowPaste(!showPaste)}
                style={{background:"transparent",border:"1px solid "+C.border,borderRadius:7,padding:"7px 14px",color:C.muted,fontSize:12,fontWeight:600,cursor:"pointer",width:"100%"}}>
                {showPaste?"▲ Hide":"📋 Paste trip text instead"}
              </button>
              {showPaste&&<div style={{marginTop:10}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Copy all text from ARINCDirect and paste below:</div>
                <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} rows={5}
                  style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}/>
                <button onClick={handlePasteImport} disabled={!pasteText.trim()}
                  style={{width:"100%",marginTop:8,background:!pasteText.trim()?"#333":C.accent,border:"none",borderRadius:8,padding:"11px",color:"#fff",fontSize:13,fontWeight:700,cursor:!pasteText.trim()?"default":"pointer"}}>
                  Parse Trip Text
                </button>
              </div>}
            </div>
          </div>

          {/* Trip settings */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:wide?20:16,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Trip Settings</div>
            <div style={{display:"grid",gridTemplateColumns:wide?"1fr 1fr 1fr 1fr":"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={{...LS,color:C.sub}}>Aircraft</label>
                <select value={aircraftId} onChange={e=>{setAircraftId(e.target.value);}}
                  style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",appearance:"none"}}>
                  {acOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{...LS,color:C.sub}}>Currency</label>
                <select value={currency.code} onChange={e=>{setCurrency(CURRENCIES.find(c=>c.code===e.target.value));}}
                  style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",appearance:"none"}}>
                  {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                </select>
              </div>
            </div>
            <div style={{background:C.bg,borderRadius:10,border:"1.5px solid "+C.accent+"55",padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>⛽ Fuel On Board at Departure (lbs)</div>
              <FobField/>
              {initialFob>0&&<div style={{fontSize:11,color:C.muted,marginTop:5}}>≈{(Number(initialFob)/6.7).toFixed(0)} gal · {(Number(initialFob)/1.77).toFixed(0)} L</div>}
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>Enter actual FOB before first leg. Subsequent legs auto-calculated.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{...LS,color:C.sub}}>Default Cruise Alt (ft)</label>
                <input type="number" value={globalAlt} onChange={e=>{setGlobalAlt(e.target.value);}}
                  style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{...LS,color:C.sub}}>Reserve Fuel (lbs)</label>
                <input type="number" value={reserveFuel} onChange={e=>{setReserveFuel(e.target.value);}}
                  style={{width:"100%",background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>

          {/* Legs */}
          {legs.map((leg,i)=>(
            <LegCard key={i} leg={leg} legNum={i+1} total={legs.length} currency={currency}
              result={calculated?results[i]:null}
              onChange={l=>updateLeg(i,l,legs[i])}
              onRemove={()=>removeLeg(i)}
              legColor={LEG_COLORS[i%LEG_COLORS.length]}
              onNextLeg={i<legs.length-1?()=>setTimeout(()=>window.__e6b?.["d"+(i+2)]?.(),100):null}
              onCalculate={i===legs.length-1?runCalc:null}/>
          ))}

          {/* Add leg */}
          <button onClick={addLeg}
            style={{width:"100%",background:"transparent",border:"1.5px dashed "+C.border,borderRadius:12,padding:"14px",color:C.muted,fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{fontSize:20,lineHeight:1}}>+</span> Add Leg {legs.length+1}
          </button>

          {/* Calculate */}
          <button onClick={runCalc}
            style={{width:"100%",background:"linear-gradient(135deg,"+C.accent+",#2a5f85)",border:"none",borderRadius:12,padding:"16px",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",letterSpacing:.3,marginBottom:14,boxShadow:"0 4px 20px "+C.accent+"44"}}>
            Calculate Tankering Decision
          </button>

          {/* Summary */}
          {calculated&&results.length>0&&<>
            <div style={{background:C.card,border:"2px solid "+(totalSavings>0?C.green:C.red),borderRadius:12,padding:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8}}>Trip Summary</div>
                <span style={{padding:"4px 14px",borderRadius:6,fontSize:13,fontWeight:800,background:(totalSavings>0?C.green:C.red)+"22",color:totalSavings>0?C.green:C.red,border:"1.5px solid "+(totalSavings>0?C.green:C.red)+"55"}}>
                  {totalSavings>0?"TANKER":"NO TANKER"}
                </span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[{l:"Net Savings",v:(totalSavings>0?"+":"-")+fM(totalSavings,sym),c:totalSavings>0?C.green:C.red},{l:"Extra Fuel",v:fL(totalExtra),c:C.text},{l:"Legs",v:String(legs.length),c:C.gold}].map(({l,v,c})=>(
                  <div key={l} style={{background:C.bg,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:.4}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                  </div>))}
              </div>
              {totalExtra>0&&<div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:8}}>{fG(totalExtra)} · {fLt(totalExtra)}</div>}
            </div>
            <button onClick={()=>setShowMath(!showMath)}
              style={{width:"100%",background:"transparent",border:"1px solid "+C.border,borderRadius:8,padding:"10px",color:C.muted,fontSize:12,cursor:"pointer",marginBottom:showMath?8:12}}>
              {showMath?"▲ Hide Math":"▼ Show Math"}
            </button>
            {showMath&&<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:14,marginBottom:12}}>
              {results.map((r,i)=>(
                <div key={i} style={{marginBottom:i<results.length-1?12:0,paddingBottom:i<results.length-1?12:0,borderBottom:i<results.length-1?"1px solid "+C.border:"none",fontSize:12,color:C.sub,lineHeight:1.9}}>
                  <div style={{color:C.text,fontWeight:700,marginBottom:4}}>Leg {i+1}: {legs[i].from}→{legs[i].to}</div>
                  <div>FOB at dep: {fL(r.fob)}</div>
                  <div>Burn: {fL(r.baseBurn)} · Reserve: {fL(Number(reserveFuel))}</div>
                  <div>Trip fuel needed: {fL(r.tripFuel)}</div>
                  <div>Price diff: {sym}{(r.priceDiff||0).toFixed(3)}/lb</div>
                  <div>Extra loaded: {fL(r.tankerLbs)}</div>
                  <div>Net: <span style={{color:r.savings>0?C.green:r.savings<0?C.red:C.muted,fontWeight:700}}>{r.savings>0?"+":r.savings<0?"-":""}{fM(r.savings,sym)}</span></div>
                </div>))}
            </div>}
            <button onClick={()=>setBriefModal(buildBrief(legs,results,totalSavings,currency,currentAc,globalAlt,reserveFuel))}
              style={{width:"100%",background:C.panel,border:"1px solid "+C.border,borderRadius:10,padding:"13px",color:C.light,fontSize:14,fontWeight:600,cursor:"pointer"}}>
              🖨 View Brief
            </button>
          </>}
        </>}

        {screen==="pcn"&&<PavementCalc/>}

        {screen==="bke"&&<BrakeCalc/>}

        {screen==="duty"&&<FlightDutyCalc/>}

        {screen==="aircraft"&&<>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Built-In</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:C.bg,borderRadius:8,border:"1px solid "+C.accent+"33"}}>
              <div><div style={{fontWeight:700,fontSize:14}}>Gulfstream V</div><div style={{fontSize:12,color:C.muted}}>MTOW 90,500 lb · BOW 48,557 lb · Max fuel 41,300 lb</div></div>
              <span style={{fontSize:11,color:C.accent,fontWeight:600}}>BUILT-IN</span>
            </div>
          </div>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:.8}}>Custom Aircraft</div>
              <button onClick={()=>setEditingAc({name:"",bow:"",mtow:"",mlw:"",mzfw:"",maxFuel:"",customBurnRate:"",burnPenaltyFactor:"0.04",id:""})}
                style={{background:C.accent+"22",border:"1px solid "+C.accent+"44",color:C.accent,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add</button>
            </div>
            {profiles.length===0&&<div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>No custom aircraft saved.</div>}
            {profiles.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:C.bg,borderRadius:8,border:"1px solid "+C.border,marginBottom:8}}>
                <div><div style={{fontWeight:700,fontSize:14}}>{p.name}</div><div style={{fontSize:12,color:C.muted}}>MTOW {fL(p.mtow)} · BOW {fL(p.bow)}</div></div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setEditingAc(p)} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>Edit</button>
                  <button onClick={()=>deleteProfile(p.id)} style={{background:"transparent",border:"1px solid "+C.red+"44",color:C.red,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>✕</button>
                </div>
              </div>))}
          </div>
          {editingAc&&<AircraftForm ac={editingAc} onSave={saveProfile} onCancel={()=>setEditingAc(null)}/>}
        </>}

        {screen==="history"&&<>
          {history.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}><div style={{fontSize:40,marginBottom:14}}>📋</div>No calculations yet.</div>:<>
            {history.map((h,i)=>{
              const pos=h.totalSavings>0,cur=CURRENCIES.find(c=>c.code===h.currency)||CURRENCIES[0];
              const route=h.legs?.map((l,j)=>j===0?l.from+"→"+l.to:l.to).join("→")||"—";
              return(<div key={h.id||i} style={{background:C.card,border:"1px solid "+(pos?C.green+"44":C.border),borderRadius:12,padding:14,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,letterSpacing:.3}}>{route}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>{h.aircraft} · {h.currency} · {h.ts?new Date(h.ts).toLocaleDateString():""}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,marginLeft:10}}>
                    <span style={{fontSize:13,fontWeight:700,color:pos?C.green:C.red}}>{pos?"+":"-"}{fM(h.totalSavings,cur.symbol)}</span>
                    <button onClick={()=>setBriefModal(buildBrief(h.legs,h.results,h.totalSavings,cur,{name:h.aircraft},h.globalAlt,h.reserveFuel))}
                      style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:11}}>Brief</button>
                  </div>
                </div>
              </div>);})}
            <button onClick={async()=>{if(!confirm("Clear history?"))return;setHistory([]);await forget("e6b:hist");}}
              style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,padding:"8px 18px",borderRadius:7,cursor:"pointer",fontSize:12}}>Clear history</button>
          </>}
        </>}
      </div>
    </div>
    {briefModal&&<BriefModal brief={briefModal} onClose={()=>setBriefModal(null)}/>}
  </>);
}
