
const path = require("path");
const k = require(path.join(__dirname, "..", "kernel.js"));
const BASE = { enclosure:{widthB:0.8,heightH:2,depthT:0.6}, mounting:{rear:"free",sides:"free",top:"free"}, material:"stahl_lackiert", components:[] };
let ok=0, fail=0;
const t=(n,c)=>{ c?(ok++,console.log("  ok",n)):(fail++,console.log("FAIL:",n)); };
// tMin=15, tMax=10 → beide valide (tMin ≤20, tMax ≤70), tMin>tMax
const r2 = k.calculate({...BASE, environment:{tMax:10,tMin:15}, target:{tInMax:35}, components:[]});
t("tMin>tMax-Warnung", r2.warnings.some(w=>w.includes("vertauscht")||w.includes("swapped")));
const r3 = k.calculate({...BASE, environment:{tMin:10,tExp:-10,rhPercent:80}, target:{tInMin:10}, components:[]});
t("kein-Heizbedarf-Note", r3.heating.required===0 && r3.heating.note.includes("Keine Heizleistung"));
const r3b = k.calculate({...BASE, environment:{tMin:-10,tExp:-20,rhPercent:80}, target:{tInMin:5}, components:[]});
t("Magnus-Bereichs-Hinweis", r3b.assumptions.some(a=>a.includes("Magnus")));
console.log("\nEDGE: "+ok+" ok, "+fail+" fail");
process.exit(fail?1:0);
