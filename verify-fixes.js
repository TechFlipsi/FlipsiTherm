
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("/root/FlipsiTherm/FlipsiTherm.html", "utf8");
const dom = new JSDOM(html, { runScripts:"dangerously", pretendToBeVisual:true, url:"http://localhost/x",
  beforeParse(w){ let s={}; Object.defineProperty(w,"localStorage",{value:{getItem:k=>s[k]||null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];}},configurable:true});
    w.fetch=()=>Promise.resolve({ok:false,status:0,json:()=>Promise.reject(new Error("off"))}); w.print=()=>{}; w.scrollTo=()=>{}; w.alert=(m)=>{w.__lastAlert=m;}; }});
const {window:w}=dom, {document:d}=w;
(async()=>{
  await new Promise(r=>{ if(d.readyState==="complete")r(); else w.addEventListener("load",r); });
  await new Promise(r=>setTimeout(r,50));
  let ok=0, fail=0;
  const t=(n,c)=>{ c?(ok++,console.log("  ok",n)):(fail++,console.log("FAIL:",n)); };
  const calc=()=>{ w.goto(3); d.getElementById("btnCalc").click(); };

  // 1+2: Protokoll-Rohkeys
  calc(); d.getElementById("btnPrint").click();
  const rep=d.getElementById("report").textContent;
  t("kein surf.sideLeft", !rep.includes("surf.sideLeft"));
  t("Material-Name im Protokoll", rep.includes("Stahlblech")||rep.includes("Painted"));
  // 3: alle Kataloge valid
  t("alle 4 Kataloge valid", w.EMBEDDED.catalogs.every(c=>w.validateCatalog(c)));
  // 4: XSS geblockt
  w.state.catDevices.push({typ:"heizung",bezeichnung:"XSS",hersteller:"Evil",leistung_W:2000,layer:1,quell_url:"javascript:alert(1)",status:"verifiziert"});
  w.goto(3); calc();
  t("kein javascript:-Link", !d.querySelector("#devTable a[href^='javascript:']"));
  // 5: Warnung >60°C
  w.state.project.target.tInMax=65; calc();
  t("Warnung >60°C sichtbar", d.getElementById("main").textContent.includes("60 °C"));
  // 6: Kunden-Merge
  w.state.customers=[{name:"A"},{name:"B"}];
  await w.loadProject({text:()=>Promise.resolve(JSON.stringify({flipsitherm_project:"2", project:{customer:{},enclosure:{widthB:1,heightH:2,depthT:0.5}}, customDevs:[], customers:[{name:"C"}]}))});
  await new Promise(r=>setTimeout(r,80));
  t("Kunden gemerged", w.state.customers.length===3 && w.state.customers.some(c=>c.name==="A"));
  t("lastResult invalidiert", w.state.lastResult===null);
  // 6b: Load ohne mounting
  let okLoad=true; try{ await w.loadProject({text:()=>Promise.resolve(JSON.stringify({flipsitherm_project:"2", project:{customer:{},enclosure:{widthB:1,heightH:2,depthT:0.5}}, customers:[]}))}); await new Promise(r=>setTimeout(r,80)); w.goto(1); }catch(e){ okLoad=false; }
  t("Load ohne mounting ok", okLoad);
  // 7: calculate ohne target
  try{ w.FlipsiThermKernel.calculate({enclosure:{widthB:1,heightH:2,depthT:0.5},mounting:{},material:"stahl_lackiert",environment:{tMin:-10},components:[]}); t("calculate ohne target ok", true); }catch(e){ t("calculate ohne target ok", false); }
  // 8: altitude
  const rAlt=w.FlipsiThermKernel.calculate({enclosure:{widthB:0.8,heightH:2,depthT:0.6},mounting:{rear:"free",sides:"free",top:"free"},material:"stahl_lackiert",environment:{tMax:35,altitude_m:1500},target:{tInMax:30},components:[]});
  t("altitude-Annahme", rAlt.assumptions.some(a=>a.includes("1500")));
  // 9: cat_schema Alert
  await w.loadCustomCatalog({text:()=>Promise.resolve(JSON.stringify({hersteller:"X",devices:[{typ:"unbekannt"},{typ:"unbekannt"},{typ:"heizung",leistung_W:5},{typ:"heizung",leistung_W:2}]}))});
  await new Promise(r=>setTimeout(r,80));
  t("cat_schema-Alert (kein Rohkey)", w.__lastAlert && !w.__lastAlert.includes("msg.cat_schema"));
  // 10: report hidden nach Druck — gültige Rechnung + Druck
  w.state.project.environment={tMax:35,tMin:-10,rhPercent:60}; w.state.project.target={tInMax:30,tInMin:5};
  w.goto(3); calc();
  d.getElementById("btnPrint").click();
  t("report nach Druck hidden", d.getElementById("report").style.display==="none");

  console.log("\nERGEBNIS: "+ok+" ok, "+fail+" fehlgeschlagen");
  process.exit(fail?1:0);
})();
